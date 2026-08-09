import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { BookOpen, LibraryBig, LogOut, PlusCircle, Search, Settings } from 'lucide-react'
import { auth, db, googleProvider, OWNER_EMAIL } from './firebase'
import type { Book, Shelf, ShelfPhoto } from './types'
import { APP_VERSION, RELEASE_NOTES, USAGE_GUIDE } from './version'
import { SearchView } from './components/SearchView'
import { MapView } from './components/MapView'
import { AddView } from './components/AddView'
import { SettingsView } from './components/SettingsView'
import { BookDetail } from './components/BookDetail'
import { Modal, Spinner, btnPrimary } from './components/ui'

type Tab = 'search' | 'map' | 'add' | 'settings'
type MemberState = 'checking' | 'ok' | 'denied'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [memberState, setMemberState] = useState<MemberState>('checking')
  const [members, setMembers] = useState<string[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [photos, setPhotos] = useState<ShelfPhoto[]>([])
  const [tab, setTab] = useState<Tab>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [showUsage, setShowUsage] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [loginError, setLoginError] = useState('')

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])

  // メンバー判定: members ドキュメントの購読を試みる(拒否されたら非メンバー)
  useEffect(() => {
    if (!user) { setMemberState('checking'); setMembers([]); return }
    const email = user.email ?? ''
    const unsub = onSnapshot(
      doc(db, 'hondoko-config', 'members'),
      (snap) => {
        const emails: string[] = (snap.exists() && snap.data().emails) || []
        setMembers(emails)
        setMemberState(email === OWNER_EMAIL || emails.includes(email) ? 'ok' : 'denied')
      },
      () => {
        // permission-denied: メンバーでない(オーナーはルール上必ず読める)
        setMemberState(email === OWNER_EMAIL ? 'ok' : 'denied')
      },
    )
    return unsub
  }, [user])

  // データ購読
  useEffect(() => {
    if (memberState !== 'ok') { setShelves([]); setBooks([]); setPhotos([]); return }
    const unsub1 = onSnapshot(query(collection(db, 'hondoko-shelves'), orderBy('order')), (snap) => {
      setShelves(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Shelf))
    })
    const unsub2 = onSnapshot(collection(db, 'hondoko-books'), (snap) => {
      setBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Book))
    })
    const unsub3 = onSnapshot(collection(db, 'hondoko-photos'), (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShelfPhoto))
    })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [memberState])

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? null,
    [books, selectedBookId],
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

  if (memberState === 'checking') {
    return <div className="min-h-dvh flex items-center justify-center bg-stone-100"><Spinner label="確認中…" /></div>
  }

  if (memberState === 'denied') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-stone-100 px-6 text-center">
        <p className="text-stone-700 font-medium mb-2">このアカウントは利用が許可されていません</p>
        <p className="text-sm text-stone-500 mb-6">{user.email}<br />家族のオーナーにメンバー追加を依頼してください</p>
        <button className={btnPrimary} onClick={() => signOut(auth)}>別のアカウントでログイン</button>
      </div>
    )
  }

  const TABS: { key: Tab; label: string; icon: typeof Search }[] = [
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
          <MapView shelves={shelves} books={books} photos={photos} onSelectBook={setSelectedBookId} />
        )}
        {tab === 'add' && <AddView shelves={shelves} books={books} />}
        {tab === 'settings' && (
          <SettingsView shelves={shelves} books={books} members={members} userEmail={user.email ?? ''} />
        )}
      </main>

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
      {selectedBook && (
        <BookDetail
          book={selectedBook}
          books={books}
          shelves={shelves}
          onClose={() => setSelectedBookId(null)}
          onSelectBook={setSelectedBookId}
          onSearchTag={(t) => { setSearchQuery(`#${t}`); setTab('search') }}
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
