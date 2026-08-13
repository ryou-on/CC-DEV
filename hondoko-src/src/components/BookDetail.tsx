import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage'
import {
  Building2, Camera, ClipboardPaste, ExternalLink, Link2, MapPin, Pencil, RefreshCw, Send, Star, Trash2, User, X,
} from 'lucide-react'
import { db, storage } from '../firebase'
import type { Book, BookComment, Shelf } from '../types'
import { lookupBookInfo, resizeImageToBase64 } from '../lib/api'
import { locationLabel, locationLabelLong } from '../lib/diff'
import { Modal, Tag, btnSecondary, inputCls } from './ui'
import { BookForm, KIND_LABEL } from './BookForm'

const yen = (n: number) => n.toLocaleString('ja-JP') + '円'
const formatPubDate = (d: string) =>
  d.length >= 8 ? `${d.slice(0, 4)}年${+d.slice(4, 6)}月${+d.slice(6, 8)}日`
  : d.length >= 6 ? `${d.slice(0, 4)}年${+d.slice(4, 6)}月`
  : `${d.slice(0, 4)}年`

export function BookDetail({
  book,
  books,
  shelves,
  comments,
  readOnly,
  canComment,
  needsLoginToComment,
  onLogin,
  currentUser,
  isOwner,
  onClose,
  onSelectBook,
  onSearch,
}: {
  book: Book
  books: Book[]
  shelves: Shelf[]
  comments: BookComment[]
  readOnly: boolean
  canComment: boolean
  needsLoginToComment?: boolean
  onLogin?: () => void
  currentUser: { email: string; name: string }
  isOwner: boolean
  onClose: () => void
  onSelectBook: (id: string) => void
  onSearch: (query: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [coverLoading, setCoverLoading] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [commentText, setCommentText] = useState('')
  const [posting, setPosting] = useState(false)
  const fetchedFor = useRef<string | null>(null)

  const bookRef = doc(db, 'hondoko-books', book.id)
  const patch = (data: Record<string, unknown>) =>
    updateDoc(bookRef, { ...data, updatedAt: serverTimestamp() })

  // 書影+定価の遅延自動取得(メンバーが開いたときに1回だけ試行しキャッシュ)
  useEffect(() => {
    if (book.coverUrl !== undefined && book.listPrice !== undefined && book.pubDate !== undefined) return
    if (fetchedFor.current === book.id) return
    if (!book.title || readOnly) return
    fetchedFor.current = book.id
    setCoverLoading(true)
    lookupBookInfo(book)
      .then((info) =>
        updateDoc(bookRef, {
          ...(book.coverUrl === undefined ? { coverUrl: info.coverUrl ?? '' } : {}),
          ...(book.listPrice === undefined ? { listPrice: info.price } : {}),
          ...(book.pubDate === undefined ? { pubDate: info.pubDate ?? '' } : {}),
          ...(info.isbn && !book.isbn ? { isbn: info.isbn } : {}),
        }),
      )
      .catch(() => {})
      .finally(() => setCoverLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, readOnly])

  const refetchCover = async () => {
    setCoverLoading(true)
    try {
      const info = await lookupBookInfo(book)
      await updateDoc(bookRef, {
        coverUrl: info.coverUrl ?? '',
        ...(book.listPrice == null ? { listPrice: info.price } : {}),
        ...(info.isbn && !book.isbn ? { isbn: info.isbn } : {}),
      })
    } finally {
      setCoverLoading(false)
    }
  }

  // 手動登録: 表紙を撮影/画像を選択してStorageへ
  const coverFileInput = useRef<HTMLInputElement>(null)
  const uploadCover = async (file: File) => {
    setCoverLoading(true)
    try {
      const base64 = await resizeImageToBase64(file, 600)
      const path = `hondoko/covers/${book.id}_${Date.now()}.jpg`
      await uploadString(storageRef(storage, path), base64, 'base64', { contentType: 'image/jpeg' })
      const url = await getDownloadURL(storageRef(storage, path))
      await updateDoc(bookRef, { coverUrl: url })
    } catch (e) {
      alert('アップロードに失敗しました: ' + (e instanceof Error ? e.message : e))
    }
    setCoverLoading(false)
  }

  // 手動登録: クリップボードの画像をペースト
  const pasteCover = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await item.getType(type)
          await uploadCover(new File([blob], 'pasted-cover', { type }))
          return
        }
      }
      alert('クリップボードに画像がありません。画像をコピーしてから押してください')
    } catch {
      alert('ペーストできませんでした。ブラウザで許可するか、この画面で Cmd+V(Ctrl+V)でも登録できます')
    }
  }

  // Cmd/Ctrl+V の直接ペーストにも対応(メンバーのみ)
  useEffect(() => {
    if (readOnly) return
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) { e.preventDefault(); uploadCover(f) }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, book.id])

  // 手動登録: 画像URLを直接指定
  const setCoverByUrl = async () => {
    const url = prompt('書影の画像URLを貼り付けてください(https://…)', book.coverUrl || '')
    if (url == null) return
    if (url !== '' && !/^https:\/\//.test(url)) { alert('httpsのURLを指定してください'); return }
    await updateDoc(bookRef, { coverUrl: url })
  }

  const related = useMemo(() => {
    const scored = books
      .filter((b) => b.id !== book.id)
      .map((b) => {
        let score = 0
        if (book.author && b.author === book.author) score += 3
        score += b.tags.filter((t) => book.tags.includes(t)).length
        return { b, score }
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
    return scored.slice(0, 8).map((x) => x.b)
  }, [book, books])

  const sortedComments = useMemo(
    () => comments.slice().sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)),
    [comments],
  )

  const setStatus = async (status: Book['status']) => {
    await patch({ status, ...(status !== 'owned' ? { shelfId: null, row: null } : {}) })
  }

  const remove = async () => {
    if (!confirm(`「${book.title}」を削除しますか？(取り消せません)`)) return
    await deleteDoc(bookRef)
    onClose()
  }

  const addTag = async () => {
    const t = tagInput.replace(/^#/, '').trim()
    if (!t || book.tags.includes(t)) { setTagInput(''); return }
    await patch({ tags: [...book.tags, t] })
    setTagInput('')
  }

  const removeTag = async (t: string) => {
    await patch({ tags: book.tags.filter((x) => x !== t) })
  }

  const postComment = async () => {
    const text = commentText.trim()
    if (!text) return
    setPosting(true)
    try {
      await addDoc(collection(db, 'hondoko-comments'), {
        bookId: book.id,
        text,
        by: currentUser.email,
        byName: currentUser.name,
        createdAt: serverTimestamp(),
      })
      setCommentText('')
    } catch (e) {
      alert('コメントの投稿に失敗しました: ' + (e instanceof Error ? e.message : e))
    }
    setPosting(false)
  }

  const searchChip = (icon: React.ReactNode, label: string, query: string) => (
    <button
      key={query}
      onClick={() => { onClose(); onSearch(query) }}
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100 transition-colors"
    >
      {icon}{label}
    </button>
  )

  if (editing) {
    return <BookForm book={book} shelves={shelves} onClose={() => setEditing(false)} />
  }

  const authors = book.author.split(/[、,;/／]/).map((a) => a.trim()).filter(Boolean)
  const amazonUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(book.isbn || `${book.title} ${book.author}`)}`
  const mercariUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(`${book.title} ${book.author}`.trim())}&status=on_sale`
  const rating = book.rating ?? 0
  const isRead = book.readStatus === 'read'

  return (
    <Modal title={book.title + (book.volume ? ` (${book.volume})` : '')} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-4">
          {/* 書影 */}
          <div className="w-24 shrink-0">
            <div className="w-24 min-h-32 rounded-md overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-stone-400 text-center px-1">
                  {coverLoading ? '取得中…' : '書影なし'}
                </span>
              )}
            </div>
            {!readOnly && (
              <div className="mt-1 space-y-0.5">
                <input
                  ref={coverFileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = '' }}
                />
                <button
                  className="w-full text-[10px] text-stone-400 hover:text-amber-700 inline-flex items-center justify-center gap-0.5"
                  onClick={refetchCover}
                  disabled={coverLoading}
                >
                  <RefreshCw size={10} className={coverLoading ? 'animate-spin' : ''} /> 自動取得
                </button>
                <button
                  className="w-full text-[10px] text-stone-400 hover:text-amber-700 inline-flex items-center justify-center gap-0.5"
                  onClick={() => coverFileInput.current?.click()}
                  disabled={coverLoading}
                >
                  <Camera size={10} /> 画像をアップロード
                </button>
                <button
                  className="w-full text-[10px] text-stone-400 hover:text-amber-700 inline-flex items-center justify-center gap-0.5"
                  onClick={pasteCover}
                  disabled={coverLoading}
                  title="コピーした画像を登録(Cmd+Vでも可)"
                >
                  <ClipboardPaste size={10} /> ペーストで登録
                </button>
                <button
                  className="w-full text-[10px] text-stone-400 hover:text-amber-700 inline-flex items-center justify-center gap-0.5"
                  onClick={setCoverByUrl}
                  disabled={coverLoading}
                >
                  <Link2 size={10} /> URLで登録
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <MapPin size={16} className="shrink-0" />
              <span className="font-bold text-sm">{locationLabelLong(book, shelves)}</span>
            </div>

            {/* 既読・評価 */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                disabled={readOnly}
                onClick={() => patch({ readStatus: isRead ? 'unread' : 'read' })}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                  isRead
                    ? 'bg-green-100 text-green-800 border-green-300'
                    : 'bg-stone-100 text-stone-500 border-stone-300'
                } ${readOnly ? 'cursor-default' : 'hover:opacity-80'}`}
              >
                {isRead ? '✓ 読了' : '未読'}
              </button>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    disabled={readOnly}
                    onClick={() => patch({ rating: rating === n ? 0 : n })}
                    className={readOnly ? 'cursor-default' : 'hover:scale-110 transition-transform'}
                  >
                    <Star
                      size={18}
                      className={n <= rating ? 'text-amber-500 fill-amber-400' : 'text-stone-300'}
                    />
                  </button>
                ))}
              </div>
            </div>

            <dl className="text-sm space-y-1.5">
              {authors.length > 0 && (
                <div className="flex gap-2 items-start">
                  <dt className="w-14 text-stone-400 shrink-0 pt-0.5">著者</dt>
                  <dd className="flex flex-wrap gap-1">
                    {authors.map((a) => searchChip(<User size={11} />, a, `著者:${a}`))}
                  </dd>
                </div>
              )}
              {book.publisher && (
                <div className="flex gap-2 items-start">
                  <dt className="w-14 text-stone-400 shrink-0 pt-0.5">出版社</dt>
                  <dd>{searchChip(<Building2 size={11} />, book.publisher, `出版社:${book.publisher}`)}</dd>
                </div>
              )}
              <div className="flex gap-2"><dt className="w-14 text-stone-400 shrink-0">種別</dt><dd className="text-stone-800">{KIND_LABEL[book.kind]}</dd></div>
              {book.isbn && (
                <div className="flex gap-2"><dt className="w-14 text-stone-400 shrink-0">ISBN</dt><dd className="text-stone-800">{book.isbn}</dd></div>
              )}
              {book.listPrice != null && (
                <div className="flex gap-2"><dt className="w-14 text-stone-400 shrink-0">定価</dt><dd className="text-stone-800">{yen(book.listPrice)} <span className="text-[10px] text-stone-400">(自動取得)</span></dd></div>
              )}
              {!!book.pubDate && (
                <div className="flex gap-2"><dt className="w-14 text-stone-400 shrink-0">出版</dt><dd className="text-stone-800">{formatPubDate(book.pubDate)}</dd></div>
              )}
              {book.memo && (
                <div className="flex gap-2"><dt className="w-14 text-stone-400 shrink-0">メモ</dt><dd className="text-stone-800 whitespace-pre-wrap">{book.memo}</dd></div>
              )}
            </dl>

            {/* 外部リンク */}
            <div className="flex flex-wrap gap-2 text-xs">
              <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">
                <ExternalLink size={11} /> Amazonで見る(レビュー)
              </a>
              <a href={mercariUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">
                <ExternalLink size={11} /> メルカリ相場を見る
              </a>
            </div>
          </div>
        </div>

        {/* 価格(メンバーのみ) */}
        {!readOnly && (
          <div className="grid grid-cols-2 gap-3 bg-stone-50 rounded-xl border border-stone-200 p-3">
            <div>
              <label className="text-xs font-medium text-stone-500">購入価格(円)<span className="font-normal">未入力なら定価で集計</span></label>
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                placeholder={book.listPrice != null ? `未入力(定価 ${book.listPrice}円で集計)` : '例: 1650'}
                defaultValue={book.purchasePrice ?? ''}
                onBlur={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  if (v !== (book.purchasePrice ?? null)) patch({ purchasePrice: v })
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500">想定売値(円)<span className="font-normal">メルカリ相場を参考に</span></label>
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                placeholder="例: 800"
                defaultValue={book.resalePrice ?? ''}
                onBlur={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  if (v !== (book.resalePrice ?? null)) patch({ resalePrice: v })
                }}
              />
            </div>
            {(book.purchasePrice != null || book.resalePrice != null) && (
              <p className="col-span-2 text-[11px] text-stone-400">
                {book.purchasePrice != null && `購入 ${yen(book.purchasePrice)}`}
                {book.purchasePrice != null && book.resalePrice != null && ' / '}
                {book.resalePrice != null && `想定売値 ${yen(book.resalePrice)}`}
              </p>
            )}
          </div>
        )}

        {/* タグ(メンバーはその場で追加・削除可) */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5 items-center">
            {book.tags.map((t) => (
              <span key={t} className="inline-flex items-center">
                <Tag label={t} onClick={() => { onClose(); onSearch(`#${t}`) }} />
                {!readOnly && (
                  <button className="ml-0.5 text-stone-300 hover:text-red-500" onClick={() => removeTag(t)} title="タグを削除">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {book.tags.length === 0 && <span className="text-xs text-stone-400">タグなし</span>}
          </div>
          {!readOnly && (
            <div className="flex gap-1.5">
              <input
                className={inputCls + ' !py-1.5 text-xs'}
                placeholder="タグを追加(Enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
              <button className={btnSecondary + ' !py-1.5 !px-3 text-xs shrink-0'} onClick={addTag} disabled={!tagInput.trim()}>
                追加
              </button>
            </div>
          )}
        </div>

        {/* 操作(メンバーのみ) */}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary} onClick={() => setEditing(true)}>
              <span className="inline-flex items-center gap-1.5"><Pencil size={14} />編集</span>
            </button>
            {book.status !== 'unplaced' && (
              <button className={btnSecondary} onClick={() => setStatus('unplaced')}>未配置にする</button>
            )}
            {book.status !== 'sold' && (
              <button className={btnSecondary} onClick={() => setStatus('sold')}>売却済みにする</button>
            )}
            <button className="text-red-600 border border-red-200 hover:bg-red-50 font-medium rounded-lg px-4 py-2 text-sm" onClick={remove}>
              <span className="inline-flex items-center gap-1.5"><Trash2 size={14} />削除</span>
            </button>
          </div>
        )}

        {/* コメント */}
        <div>
          <h3 className="text-sm font-bold text-stone-600 mb-2">コメント {sortedComments.length > 0 && `(${sortedComments.length})`}</h3>
          <ul className="space-y-2 mb-2">
            {sortedComments.map((c) => (
              <li key={c.id} className="bg-stone-50 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-stone-600">{c.byName || c.by}</span>
                  <span className="text-[10px] text-stone-400">
                    {c.createdAt ? c.createdAt.toDate().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </span>
                  {(isOwner || c.by === currentUser.email) && (
                    <button
                      className="ml-auto text-stone-300 hover:text-red-500"
                      onClick={() => deleteDoc(doc(db, 'hondoko-comments', c.id))}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <p className="text-stone-700 whitespace-pre-wrap mt-0.5">{c.text}</p>
              </li>
            ))}
            {sortedComments.length === 0 && <li className="text-xs text-stone-400">まだコメントはありません</li>}
          </ul>
          {needsLoginToComment && (
            <button className="text-xs text-amber-700 underline" onClick={onLogin}>
              コメントするにはGoogleログイン
            </button>
          )}
          {canComment && (
            <div className="flex gap-1.5">
              <input
                className={inputCls + ' text-sm'}
                placeholder="コメントを書く…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && postComment()}
              />
              <button
                className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white rounded-lg px-3 disabled:opacity-40"
                onClick={postComment}
                disabled={posting || !commentText.trim()}
              >
                <Send size={15} />
              </button>
            </div>
          )}
        </div>

        {/* 関連書籍 */}
        {related.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-stone-600 mb-2">関連書籍</h3>
            <ul className="space-y-1">
              {related.map((b) => (
                <li key={b.id}>
                  <button
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-stone-200 hover:bg-stone-50 flex items-center gap-2.5"
                    onClick={() => onSelectBook(b.id)}
                  >
                    <div className="w-6 h-8 shrink-0 rounded-sm overflow-hidden bg-stone-100">
                      {b.coverUrl && <img src={b.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-stone-800 block truncate">{b.title}{b.volume ? ` (${b.volume})` : ''}</span>
                      <span className="block text-xs text-stone-400 truncate">
                        {b.author || '著者不明'} — {locationLabel(b, shelves)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
