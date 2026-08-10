import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Building2, MapPin, Pencil, RefreshCw, Trash2, User } from 'lucide-react'
import { db } from '../firebase'
import type { Book, Shelf } from '../types'
import { lookupCover } from '../lib/api'
import { locationLabel, locationLabelLong } from '../lib/diff'
import { Modal, Tag, btnSecondary } from './ui'
import { BookForm, KIND_LABEL } from './BookForm'

export function BookDetail({
  book,
  books,
  shelves,
  onClose,
  onSelectBook,
  onSearch,
}: {
  book: Book
  books: Book[]
  shelves: Shelf[]
  onClose: () => void
  onSelectBook: (id: string) => void
  onSearch: (query: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [coverLoading, setCoverLoading] = useState(false)
  const fetchedFor = useRef<string | null>(null)

  // 書影の遅延取得(未取得の本を開いたときに1回だけ試行し、結果をキャッシュ)
  useEffect(() => {
    if (book.coverUrl !== undefined) return
    if (fetchedFor.current === book.id) return
    if (!book.title) return
    fetchedFor.current = book.id
    setCoverLoading(true)
    lookupCover(book)
      .then((url) => updateDoc(doc(db, 'hondoko-books', book.id), { coverUrl: url ?? '' }))
      .catch(() => {})
      .finally(() => setCoverLoading(false))
  }, [book])

  const refetchCover = async () => {
    setCoverLoading(true)
    try {
      const url = await lookupCover(book)
      await updateDoc(doc(db, 'hondoko-books', book.id), { coverUrl: url ?? '' })
    } finally {
      setCoverLoading(false)
    }
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

  const setStatus = async (status: Book['status']) => {
    await updateDoc(doc(db, 'hondoko-books', book.id), {
      status,
      ...(status !== 'owned' ? { shelfId: null, row: null } : {}),
      updatedAt: serverTimestamp(),
    })
  }

  const remove = async () => {
    if (!confirm(`「${book.title}」を削除しますか？(取り消せません)`)) return
    await deleteDoc(doc(db, 'hondoko-books', book.id))
    onClose()
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

  const authors = book.author.split(/[、,]/).map((a) => a.trim()).filter(Boolean)

  return (
    <Modal title={book.title + (book.volume ? ` (${book.volume})` : '')} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-4">
          {/* 書影 */}
          <div className="w-24 shrink-0">
            <div className="w-24 h-34 min-h-32 rounded-md overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-stone-400 text-center px-1">
                  {coverLoading ? '取得中…' : '書影なし'}
                </span>
              )}
            </div>
            <button
              className="w-full mt-1 text-[10px] text-stone-400 hover:text-amber-700 inline-flex items-center justify-center gap-0.5"
              onClick={refetchCover}
              disabled={coverLoading}
            >
              <RefreshCw size={10} className={coverLoading ? 'animate-spin' : ''} /> 書影を再取得
            </button>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <MapPin size={16} className="shrink-0" />
              <span className="font-bold text-sm">{locationLabelLong(book, shelves)}</span>
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
              {book.memo && (
                <div className="flex gap-2"><dt className="w-14 text-stone-400 shrink-0">メモ</dt><dd className="text-stone-800 whitespace-pre-wrap">{book.memo}</dd></div>
              )}
            </dl>
          </div>
        </div>

        {book.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {book.tags.map((t) => (
              <Tag key={t} label={t} onClick={() => { onClose(); onSearch(`#${t}`) }} />
            ))}
          </div>
        )}

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
