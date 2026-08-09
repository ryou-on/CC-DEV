import { useMemo, useState } from 'react'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { MapPin, Pencil, Trash2 } from 'lucide-react'
import { db } from '../firebase'
import type { Book, Shelf } from '../types'
import { locationLabel } from '../lib/diff'
import { Modal, Tag, btnSecondary } from './ui'
import { BookForm, KIND_LABEL } from './BookForm'

export function BookDetail({
  book,
  books,
  shelves,
  onClose,
  onSelectBook,
  onSearchTag,
}: {
  book: Book
  books: Book[]
  shelves: Shelf[]
  onClose: () => void
  onSelectBook: (id: string) => void
  onSearchTag: (tag: string) => void
}) {
  const [editing, setEditing] = useState(false)

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

  if (editing) {
    return <BookForm book={book} shelves={shelves} onClose={() => setEditing(false)} />
  }

  return (
    <Modal title={book.title + (book.volume ? ` (${book.volume})` : '')} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <MapPin size={18} className="shrink-0" />
          <span className="font-bold">{locationLabel(book, shelves)}</span>
        </div>

        <dl className="text-sm space-y-1.5">
          {book.author && (
            <div className="flex gap-2"><dt className="w-16 text-stone-400 shrink-0">著者</dt><dd className="text-stone-800">{book.author}</dd></div>
          )}
          {book.publisher && (
            <div className="flex gap-2"><dt className="w-16 text-stone-400 shrink-0">出版社</dt><dd className="text-stone-800">{book.publisher}</dd></div>
          )}
          <div className="flex gap-2"><dt className="w-16 text-stone-400 shrink-0">種別</dt><dd className="text-stone-800">{KIND_LABEL[book.kind]}</dd></div>
          {book.isbn && (
            <div className="flex gap-2"><dt className="w-16 text-stone-400 shrink-0">ISBN</dt><dd className="text-stone-800">{book.isbn}</dd></div>
          )}
          {book.memo && (
            <div className="flex gap-2"><dt className="w-16 text-stone-400 shrink-0">メモ</dt><dd className="text-stone-800 whitespace-pre-wrap">{book.memo}</dd></div>
          )}
        </dl>

        {book.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {book.tags.map((t) => (
              <Tag key={t} label={t} onClick={() => { onClose(); onSearchTag(t) }} />
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
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-stone-200 hover:bg-stone-50"
                    onClick={() => onSelectBook(b.id)}
                  >
                    <span className="font-medium text-stone-800">{b.title}{b.volume ? ` (${b.volume})` : ''}</span>
                    <span className="block text-xs text-stone-400">
                      {b.author || '著者不明'} — {locationLabel(b, shelves)}
                    </span>
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
