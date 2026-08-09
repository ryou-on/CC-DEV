import { useMemo, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { BookOpen, Camera, ChevronLeft } from 'lucide-react'
import { db } from '../firebase'
import type { Book, Shelf, ShelfGroup, ShelfPhoto } from '../types'
import { PhotoDiffModal } from './PhotoDiffModal'
import { btnPrimary } from './ui'

const GROUP_ORDER: ShelfGroup[] = ['メイン', 'サブ', '別室']

const DEFAULT_SHELVES: { name: string; group: ShelfGroup; rows: number }[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ name: `IKEA-${i + 1}`, group: 'メイン' as ShelfGroup, rows: 7 })),
  ...Array.from({ length: 3 }, (_, i) => ({ name: `サブ-${i + 1}`, group: 'サブ' as ShelfGroup, rows: 6 })),
  { name: '別室-1', group: '別室' as ShelfGroup, rows: 6 },
]

export function MapView({
  shelves,
  books,
  photos,
  onSelectBook,
}: {
  shelves: Shelf[]
  books: Book[]
  photos: ShelfPhoto[]
  onSelectBook: (id: string) => void
}) {
  const [selected, setSelected] = useState<{ shelfId: string; row: number } | null>(null)
  const [photoModal, setPhotoModal] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const countByLocation = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of books) {
      if (b.status !== 'owned' || !b.shelfId || b.row == null) continue
      const key = `${b.shelfId}:${b.row}`
      m.set(key, (m.get(key) || 0) + 1)
    }
    return m
  }, [books])

  const seedShelves = async () => {
    if (!confirm('標準の棚構成(メインIKEA×6・サブ×3・別室×1)を作成しますか？\nあとから設定タブで編集できます')) return
    setSeeding(true)
    for (let i = 0; i < DEFAULT_SHELVES.length; i++) {
      await addDoc(collection(db, 'hondoko-shelves'), {
        ...DEFAULT_SHELVES[i],
        order: i,
        createdAt: serverTimestamp(),
      })
    }
    setSeeding(false)
  }

  if (shelves.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <BookOpen size={40} className="mx-auto text-stone-300" />
        <p className="text-sm text-stone-500">まだ棚が登録されていません</p>
        <button className={btnPrimary} onClick={seedShelves} disabled={seeding}>
          {seeding ? '作成中…' : '標準の棚構成を作成する'}
        </button>
      </div>
    )
  }

  // ---- 段の詳細ビュー ----
  if (selected) {
    const shelf = shelves.find((s) => s.id === selected.shelfId)
    if (!shelf) { setSelected(null); return null }
    const booksInRow = books
      .filter((b) => b.status === 'owned' && b.shelfId === shelf.id && b.row === selected.row)
      .sort((a, b) => a.position - b.position)
    const rowPhotos = photos
      .filter((p) => p.shelfId === shelf.id && p.row === selected.row)
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    const lastPhoto = rowPhotos[0]

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500">
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-bold text-stone-800">{shelf.name} — {selected.row}段目</h2>
          <span className="text-sm text-stone-400">{booksInRow.length}冊</span>
        </div>

        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="text-xs text-stone-500">
            {lastPhoto?.createdAt
              ? `最終更新: ${lastPhoto.createdAt.toDate().toLocaleDateString('ja-JP')}`
              : 'まだ写真登録がありません'}
          </div>
          <button className={btnPrimary + ' inline-flex items-center gap-1.5'} onClick={() => setPhotoModal(true)}>
            <Camera size={16} /> 写真で更新
          </button>
        </div>

        <ul className="divide-y divide-stone-100 bg-white rounded-xl border border-stone-200 overflow-hidden">
          {booksInRow.map((b) => (
            <li key={b.id}>
              <button className="w-full text-left px-4 py-2.5 hover:bg-amber-50/50" onClick={() => onSelectBook(b.id)}>
                <span className="text-sm font-medium text-stone-800">{b.title}{b.volume ? ` (${b.volume})` : ''}</span>
                <span className="block text-xs text-stone-400">{b.author || '著者不明'}</span>
              </button>
            </li>
          ))}
          {booksInRow.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-stone-400">
              この段はまだ空です。「写真で更新」から一括登録できます
            </li>
          )}
        </ul>

        {photoModal && (
          <PhotoDiffModal
            shelf={shelf}
            row={selected.row}
            booksInRow={booksInRow}
            allBooks={books}
            shelves={shelves}
            onClose={() => setPhotoModal(false)}
          />
        )}
      </div>
    )
  }

  // ---- 棚一覧ビュー ----
  return (
    <div className="space-y-5">
      {GROUP_ORDER.map((group) => {
        const groupShelves = shelves.filter((s) => s.group === group).sort((a, b) => a.order - b.order)
        if (groupShelves.length === 0) return null
        return (
          <div key={group}>
            <h2 className="text-sm font-bold text-stone-500 mb-2">{group}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {groupShelves.map((shelf) => {
                const total = Array.from({ length: shelf.rows }, (_, i) =>
                  countByLocation.get(`${shelf.id}:${i + 1}`) || 0
                )
                const shelfTotal = total.reduce((a, b) => a + b, 0)
                return (
                  <div key={shelf.id} className="bg-white rounded-xl border border-stone-200 p-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="font-bold text-sm text-stone-800">{shelf.name}</span>
                      <span className="text-xs text-stone-400">{shelfTotal}冊</span>
                    </div>
                    <div className="space-y-1">
                      {total.map((count, i) => (
                        <button
                          key={i}
                          onClick={() => setSelected({ shelfId: shelf.id, row: i + 1 })}
                          className={`w-full flex items-center justify-between rounded px-2 py-1 text-xs transition-colors border ${
                            count > 0
                              ? 'bg-amber-100/70 border-amber-200 text-amber-900 hover:bg-amber-200'
                              : 'bg-stone-50 border-stone-200 text-stone-400 hover:bg-stone-100'
                          }`}
                        >
                          <span>{i + 1}段</span>
                          <span className="font-medium">{count > 0 ? `${count}冊` : '—'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
