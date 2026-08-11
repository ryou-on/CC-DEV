import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { BookOpen, LibraryBig, Loader2, LogOut, PlusCircle, Search, Settings, X } from 'lucide-react'
import { auth, db, googleProvider, OWNER_EMAIL } from './firebase'
import type { Book, BookComment, Shelf, SharingConfig, ShelfMap, ShelfPhoto } from './types'
import { APP_VERSION, RELEASE_NOTES, USAGE_GUIDE } from './version'
import { useAnalysisJobs } from './hooks/useAnalysisJobs'
import { shelfCode } from './lib/diff'
import { DiffReviewModal } from './components/DiffReviewModal'
import { SearchView } from './components/SearchView'
import { MapView } from './components/MapView'
import { AddView } from './components/AddView'
import { SettingsView } from './components/SettingsView'
import { BookDetail } from './components/BookDetail'
import { Modal, Spinner, btnPrimary } from './components/ui'

type Tab = 'search' | 'map' | 'add' | 'settings'
// member=編集可 / viewer=閲覧のみ(公開設定によるゲスト) / denied=不可
type Role = 'checking' | 'member' | 'viewer' | 'denied'

// 非メンバーの閲覧可否を公開設定から判定
function resolveViewerRole(email: string, sharing: SharingConfig | null): Role {
  if (!sharing || sharing.mode === 'private') return 'denied'
  if (sharing.mode === 'public') return 'viewer'
  if (sharing.mode === 'viewers') return sharing.viewers?.includes(email) ? 'viewer' : 'denied'
  if (sharing.mode === 'link') {
    const k = new URLSearchParams(location.search).get('k')
    return k && k === sharing.linkKey ? 'viewer' : 'denied'
  }
  return 'denied'
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [role, setRole] = useState<Role>('checking')
  const [members, setMembers] = useState<string[]>([])
  const [sharing, setSharing] = useState<SharingConfig | null>(null)
  const [comments, setComments] = useState<BookComment[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [photos, setPhotos] = useState<ShelfPhoto[]>([])
  const [maps, setMaps] = useState<ShelfMap[]>([])
  const [tab, setTab] = useState<Tab>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [showUsage, setShowUsage] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [loginError, setLoginError] = useState('')
  const { jobs, startJob, dismissJob } = useAnalysisJobs()
  const [reviewJobId, setReviewJobId] = useState<string | null>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])

  // 公開設定の購読(ログイン済みなら誰でも読める)
  useEffect(() => {
    if (!user) { setSharing(null); return }
    return onSnapshot(
      doc(db, 'hondoko-config', 'sharing'),
      (snap) => setSharing(snap.exists() ? (snap.data() as SharingConfig) : null),
      () => setSharing(null),
    )
  }, [user])

  // ロール判定: メンバー → member、そうでなければ公開設定に応じて viewer / denied
  useEffect(() => {
    if (!user) { setRole('checking'); setMembers([]); return }
    const email = user.email ?? ''
    const unsub = onSnapshot(
      doc(db, 'hondoko-config', 'members'),
      (snap) => {
        const emails: string[] = (snap.exists() && snap.data().emails) || []
        setMembers(emails)
        if (email === OWNER_EMAIL || emails.includes(email)) setRole('member')
        else setRole(resolveViewerRole(email, sharing))
      },
      () => {
        // permission-denied: メンバーでない
        if (email === OWNER_EMAIL) setRole('member')
        else setRole(resolveViewerRole(email, sharing))
      },
    )
    return unsub
  }, [user, sharing])

  // データ購読
  useEffect(() => {
    const canRead = role === 'member' || role === 'viewer'
    if (!canRead) { setShelves([]); setBooks([]); setPhotos([]); setMaps([]); setComments([]); return }
    const unsub1 = onSnapshot(query(collection(db, 'hondoko-shelves'), orderBy('order')), (snap) => {
      setShelves(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Shelf))
    })
    const unsub2 = onSnapshot(collection(db, 'hondoko-books'), (snap) => {
      setBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Book))
    })
    const unsub3 = onSnapshot(collection(db, 'hondoko-photos'), (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShelfPhoto))
    })
    const unsub4 = onSnapshot(collection(db, 'hondoko-maps'), (snap) => {
      setMaps(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShelfMap))
    })
    const unsub5 = onSnapshot(collection(db, 'hondoko-comments'), (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BookComment))
    })
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  }, [role])

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? null,
    [books, selectedBookId],
  )

  const processingLocations = useMemo(
    () => new Set(
      jobs
        .filter((j) => j.status === 'processing' && j.target)
        .map((j) => `${j.target!.shelfId}:${j.target!.row}`),
    ),
    [jobs],
  )
  const reviewJob = jobs.find((j) => j.id === reviewJobId) ?? null
  const jobLabel = (j: { target: { shelfId: string; row: number } | null }) => {
    if (!j.target) return '自動判別'
    const s = shelves.find((x) => x.id === j.target!.shelfId)
    return s ? `${shelfCode(s)}-${j.target.row}` : '?'
  }
  // 自動判別に使うマップ(領域数が最多のもの)
  const matchMap = useMemo(
    () => maps.filter((m) => m.regions.length > 0).sort((a, b) => b.regions.length - a.regions.length)[0] ?? null,
    [maps],
  )

  const login = async () => {
    setLoginError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'ログインに失敗しました')
    }
  }

  // ---- 画面分岐 ----
  if (user === undefined) return <div className="min-h-dvh flex items-center justify-center bg-stone-100"><Spinner /></div>

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-stone-100 px-6 text-center">
        <LibraryBig size={56} className="text-amber-700 mb-4" />
        <h1 className="text-2xl font-bold text-stone-800 mb-1">本ドコ？</h1>
        <p className="text-sm text-stone-500 mb-8">本棚の写真から蔵書を登録・検索できる家族用蔵書マップ</p>
        <button className={btnPrimary + ' !px-6 !py-3'} onClick={login}>Googleでログイン</button>
        {loginError && <p className="text-sm text-red-600 mt-4">{loginError}</p>}
        <p className="text-xs text-stone-400 mt-10">{APP_VERSION}</p>
      </div>
    )
  }

  if (role === 'checking') {
    return <div className="min-h-dvh flex items-center justify-center bg-stone-100"><Spinner label="確認中…" /></div>
  }

  if (role === 'denied') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-stone-100 px-6 text-center">
        <p className="text-stone-700 font-medium mb-2">このアカウントは閲覧が許可されていません</p>
        <p className="text-sm text-stone-500 mb-6">{user.email}<br />オーナーにメンバー追加または公開設定の変更を依頼してください</p>
        <button className={btnPrimary} onClick={() => signOut(auth)}>別のアカウントでログイン</button>
      </div>
    )
  }

  const readOnly = role === 'viewer'
  const TABS: { key: Tab; label: string; icon: typeof Search }[] = readOnly
    ? [
        { key: 'search', label: '検索', icon: Search },
        { key: 'map', label: 'マップ', icon: BookOpen },
      ]
    : [
        { key: 'search', label: '検索', icon: Search },
        { key: 'map', label: 'マップ', icon: BookOpen },
        { key: 'add', label: '追加', icon: PlusCircle },
        { key: 'settings', label: '設定', icon: Settings },
      ]

  return (
    <div className="min-h-dvh bg-stone-100 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-amber-900 text-white sticky top-0 z-40 shadow">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <button className="flex items-center gap-2 font-bold" onClick={() => setShowUsage(true)} title="使い方">
            <LibraryBig size={22} />
            <span>本ドコ？</span>
          </button>
          <button className="text-[11px] text-amber-200/90 hover:text-white mt-0.5" onClick={() => setShowNotes(true)} title="リリースノート">
            {APP_VERSION}
          </button>
          {readOnly && (
            <span className="text-[10px] bg-amber-700 text-amber-100 rounded-full px-2 py-0.5">閲覧モード</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-amber-200/80 hidden sm:block">{user.email}</span>
            <button className="p-1.5 rounded hover:bg-amber-800" onClick={() => signOut(auth)} title="ログアウト">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* メイン */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-4 pb-24">
        {tab === 'search' && (
          <SearchView books={books} shelves={shelves} query={searchQuery} setQuery={setSearchQuery} onSelectBook={setSelectedBookId} />
        )}
        {tab === 'map' && (
          <MapView
            shelves={shelves}
            books={books}
            photos={photos}
            maps={maps}
            onSelectBook={setSelectedBookId}
            onStartPhoto={(shelfId, row, file) => startJob(file, { shelfId, row })}
            onStartAutoPhoto={!readOnly && matchMap ? (file) => startJob(file, null, { map: matchMap, shelves }) : undefined}
            processingLocations={processingLocations}
            readOnly={readOnly}
          />
        )}
        {tab === 'add' && !readOnly && <AddView shelves={shelves} books={books} />}
        {tab === 'settings' && !readOnly && (
          <SettingsView
            shelves={shelves}
            books={books}
            members={members}
            userEmail={user.email ?? ''}
            sharing={sharing}
          />
        )}
      </main>

      {/* 解析ジョブバー */}
      {jobs.length > 0 && (
        <div className="fixed bottom-[64px] inset-x-0 z-40 pointer-events-none pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-3xl mx-auto px-4 space-y-1.5">
            {jobs.map((j) => (
              <div
                key={j.id}
                className={`pointer-events-auto flex items-center gap-2.5 rounded-xl shadow-lg border px-3 py-2 text-sm ${
                  j.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-white border-stone-200'
                }`}
              >
                {j.status === 'processing' && (
                  <>
                    <Loader2 size={16} className="text-amber-600 animate-spin shrink-0" />
                    <span className="text-stone-600 flex-1 truncate">
                      <b>{jobLabel(j)}</b> の写真を解析中…(閉じてもOK、1〜2分)
                    </span>
                  </>
                )}
                {j.status === 'ready' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-stone-700 flex-1 truncate">
                      <b>{jobLabel(j)}</b> の解析完了(
                      {(j.result?.rows ?? []).reduce((n, r) => n + r.books.length, 0)}冊
                      {(j.result?.rows.length ?? 0) > 1 ? ` / ${j.result!.rows.length}段` : ''}検出)
                    </span>
                    <button
                      className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium rounded-lg px-3 py-1.5"
                      onClick={() => setReviewJobId(j.id)}
                    >
                      確認する
                    </button>
                  </>
                )}
                {j.status === 'error' && (
                  <span className="text-red-700 flex-1 truncate"><b>{jobLabel(j)}</b>: {j.error}</span>
                )}
                {j.status !== 'processing' && (
                  <button className="shrink-0 p-1 text-stone-400 hover:text-stone-600" onClick={() => dismissJob(j.id)}>
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* タブバー */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                tab === key ? 'text-amber-700' : 'text-stone-400'
              }`}
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* モーダル群 */}
      {reviewJob && reviewJob.status === 'ready' && (
        <DiffReviewModal
          job={reviewJob}
          shelves={shelves}
          books={books}
          onClose={() => setReviewJobId(null)}
          onApplied={() => { dismissJob(reviewJob.id); setReviewJobId(null) }}
        />
      )}
      {selectedBook && (
        <BookDetail
          book={selectedBook}
          books={books}
          shelves={shelves}
          comments={comments.filter((c) => c.bookId === selectedBook.id)}
          readOnly={readOnly}
          canComment={role === 'member' || (role === 'viewer' && !!sharing?.allowComments)}
          currentUser={{ email: user.email ?? '', name: user.displayName ?? user.email ?? '' }}
          isOwner={user.email === OWNER_EMAIL}
          onClose={() => setSelectedBookId(null)}
          onSelectBook={setSelectedBookId}
          onSearch={(q) => { setSearchQuery(q); setTab('search') }}
        />
      )}
      {showUsage && (
        <Modal title="使い方" onClose={() => setShowUsage(false)}>
          <pre className="text-sm text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">{USAGE_GUIDE}</pre>
        </Modal>
      )}
      {showNotes && (
        <Modal title="リリースノート" onClose={() => setShowNotes(false)}>
          <div className="space-y-4">
            {RELEASE_NOTES.map((n) => (
              <div key={n.version}>
                <h3 className="font-bold text-sm text-stone-800">{n.version} <span className="text-xs text-stone-400 font-normal">({n.date})</span></h3>
                <ul className="list-disc list-inside text-sm text-stone-600 mt-1">
                  {n.changes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
