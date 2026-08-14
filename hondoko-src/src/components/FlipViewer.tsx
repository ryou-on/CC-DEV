import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, Star, X } from 'lucide-react'
import type { Book, Shelf } from '../types'
import { locationLabel } from '../lib/diff'

// 書影をパラパラめくる全画面ビューア
// スワイプ / ←→キー / 左右タップ / 自動再生に対応。書影をタップで詳細へ
export function FlipViewer({
  books,
  shelves,
  startIndex = 0,
  onClose,
  onSelectBook,
}: {
  books: Book[]
  shelves: Shelf[]
  startIndex?: number
  onClose: () => void
  onSelectBook: (id: string) => void
}) {
  const [idx, setIdx] = useState(Math.min(startIndex, Math.max(0, books.length - 1)))
  const [playing, setPlaying] = useState(false)
  const [dir, setDir] = useState<1 | -1>(1) // アニメーション方向
  const touchX = useRef<number | null>(null)

  const step = useCallback(
    (d: 1 | -1) => {
      setDir(d)
      setIdx((i) => (i + d + books.length) % books.length)
    },
    [books.length],
  )

  // キーボード操作
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, onClose])

  // 自動再生(パラパラ)
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => step(1), 700)
    return () => window.clearInterval(t)
  }, [playing, step])

  if (books.length === 0) return null
  const book = books[idx]
  const prevBook = books[(idx - 1 + books.length) % books.length]
  const nextBook = books[(idx + 1) % books.length]

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 bg-black/90 flex flex-col select-none"
      onClick={onClose}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm tabular-nums">{idx + 1} / {books.length}</span>
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded-full hover:bg-white/10"
            onClick={() => setPlaying(!playing)}
            title={playing ? '停止' : 'パラパラ再生'}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button className="p-2 rounded-full hover:bg-white/10" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
      </div>

      {/* 書影 */}
      <div
        className="flex-1 flex items-center justify-center px-12 min-h-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => { touchX.current = e.clientX }}
        onPointerUp={(e) => {
          if (touchX.current == null) return
          const dx = e.clientX - touchX.current
          touchX.current = null
          if (dx < -40) step(1)
          else if (dx > 40) step(-1)
        }}
      >
        <button
          className="absolute left-1 sm:left-4 p-2 text-white/60 hover:text-white z-10"
          onClick={() => step(-1)}
        >
          <ChevronLeft size={32} />
        </button>

        <button
          key={book.id} /* keyでアニメーションを再発火 */
          className="max-h-full outline-none"
          style={{ animation: `flip-in-${dir === 1 ? 'r' : 'l'} 0.22s ease-out` }}
          onClick={() => { onClose(); onSelectBook(book.id) }}
          title="タップで詳細"
        >
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="max-h-[62dvh] max-w-full rounded-lg shadow-2xl pointer-events-none"
              draggable={false}
            />
          ) : (
            <span className="w-48 h-72 sm:w-56 sm:h-84 rounded-lg shadow-2xl bg-gradient-to-br from-stone-200 to-stone-400 flex items-center justify-center p-4 text-stone-700 font-bold text-center leading-snug">
              {book.title}
            </span>
          )}
        </button>

        <button
          className="absolute right-1 sm:right-4 p-2 text-white/60 hover:text-white z-10"
          onClick={() => step(1)}
        >
          <ChevronRight size={32} />
        </button>

        {/* 隣の書影をプリロード */}
        <div className="hidden">
          {prevBook.coverUrl && <img src={prevBook.coverUrl} alt="" />}
          {nextBook.coverUrl && <img src={nextBook.coverUrl} alt="" />}
        </div>
      </div>

      {/* 情報 */}
      <div className="px-6 pb-8 pt-4 text-center text-white" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-base truncate">{book.title}{book.volume ? ` (${book.volume})` : ''}</p>
        <p className="text-sm text-white/60 mt-0.5 truncate">
          {book.author || '著者不明'} — <span className="text-amber-400">{locationLabel(book, shelves)}</span>
        </p>
        {(book.rating ?? 0) > 0 && (
          <p className="mt-1 flex items-center justify-center gap-0.5">
            {Array.from({ length: book.rating! }, (_, i) => (
              <Star key={i} size={13} className="text-amber-400 fill-amber-400" />
            ))}
          </p>
        )}
        <p className="mt-2 text-[11px] text-white/40">
          スワイプ / ←→ でめくる · ▶で自動再生 · 書影タップで詳細 · Escで閉じる
        </p>
      </div>

      <style>{`
        @keyframes flip-in-r { from { transform: translateX(24px) rotateY(14deg); opacity: 0.3 } to { transform: none; opacity: 1 } }
        @keyframes flip-in-l { from { transform: translateX(-24px) rotateY(-14deg); opacity: 0.3 } to { transform: none; opacity: 1 } }
      `}</style>
    </div>
  )
}
