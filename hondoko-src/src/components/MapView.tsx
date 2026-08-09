import { useMemo, useRef, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadString } from 'firebase/storage'
import { BookOpen, Camera, ChevronLeft, ImagePlus, Wand2 } from 'lucide-react'
import { db, storage } from '../firebase'
import type { Book, Shelf, ShelfGroup, ShelfMap, ShelfPhoto } from '../types'
import { resizeImageToBase64 } from '../lib/api'
import { shelfCode } from '../lib/diff'
import { MapPhotoView } from './MapPhotoView'
import { btnPrimary, btnSecondary } from './ui'

const GROUP_ORDER: ShelfGroup[] = ['メイン', 'サブ', '別室']

const DEFAULT_SHELVES: { name: string; code: string; group: ShelfGroup; rows: number }[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `IKEA-${i + 1}`, code: String(i + 1), group: 'メイン' as ShelfGroup, rows: 7,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `サブ-${i + 1}`, code: String(i + 7), group: 'サブ' as ShelfGroup, rows: 6,
  })),
  { name: '別室-1', code: '10', group: '別室' as ShelfGroup, rows: 6 },
]

export function MapView({
  shelves,
  books,
  photos,
  maps,
  onSelectBook,
  onStartPhoto,
  onStartAutoPhoto,
  processingLocations,
}: {
  shelves: Shelf[]
  books: Book[]
  photos: ShelfPhoto[]
  maps: ShelfMap[]
  onSelectBook: (id: string) => void
  onStartPhoto: (shelfId: string, row: number, file: File) => void
  onStartAutoPhoto?: (file: File) => void // マップ照合による自動判別(領域のあるマップがある場合のみ)
  processingLocations: Set<string> // `${shelfId}:${row}` 解析中の段
}) {
  const [selected, setSelected] = useState<{ shelfId: string; row: number } | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [uploadingMap, setUploadingMap] = useState(false)
  const mapInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const autoInput = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<{ shelfId: string; row: number } | null>(null)

  // 「+」ボタン → カメラ/ファイル選択を直接起動
  const openPicker = (shelfId: string, row: number) => {
    photoTarget.current = { shelfId, row }
    photoInput.current?.click()
  }

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

  const addMap = async (file: File) => {
    const name = prompt('マップの名前(例: メインの壁)', 'メインの壁')
    if (!name) return
    setUploadingMap(true)
    try {
      const base64 = await resizeImageToBase64(file, 2000)
      const path = `hondoko/maps/${Date.now()}.jpg`
      await uploadString(storageRef(storage, path), base64, 'base64', { contentType: 'image/jpeg' })
      await addDoc(collection(db, 'hondoko-maps'), {
        name,
        storagePath: path,
        regions: [],
        order: maps.length,
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      alert('アップロードに失敗しました: ' + (e instanceof Error ? e.message : e))
    }
    setUploadingMap(false)
  }

  // 共有の写真入力(棚の段への追加用)
  const photoInputEl = (
    <input
      ref={photoInput}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0]
        const t = photoTarget.current
        if (f && t) onStartPhoto(t.shelfId, t.row, f)
        e.target.value = ''
      }}
    />
  )

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
    const isProcessing = processingLocations.has(`${shelf.id}:${selected.row}`)

    return (
      <div className="space-y-3">
        {photoInputEl}
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500">
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-bold text-stone-800">
            {shelfCode(shelf)}-{selected.row}
            <span className="text-sm font-normal text-stone-400 ml-2">{shelf.name} {selected.row}段目</span>
          </h2>
          <span className="text-sm text-stone-400 ml-auto">{booksInRow.length}冊</span>
        </div>

        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="text-xs text-stone-500">
            {lastPhoto?.createdAt
              ? `最終更新: ${lastPhoto.createdAt.toDate().toLocaleDateString('ja-JP')}`
              : 'まだ写真登録がありません'}
          </div>
          <button
            className={btnPrimary + ' inline-flex items-center gap-1.5'}
            onClick={() => openPicker(shelf.id, selected.row)}
            disabled={isProcessing}
          >
            <Camera size={16} /> {isProcessing ? '解析中…' : '写真で更新'}
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
      </div>
    )
  }

  // ---- マップ一覧ビュー ----
  return (
    <div className="space-y-5">
      {photoInputEl}

      {/* 自動判別で追加 */}
      {onStartAutoPhoto && (
        <div>
          <input
            ref={autoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onStartAutoPhoto(f)
              e.target.value = ''
            }}
          />
          <button
            className={btnPrimary + ' w-full inline-flex items-center justify-center gap-2 !py-3'}
            onClick={() => autoInput.current?.click()}
          >
            <Wand2 size={17} /> 写真を撮って自動判別で登録
          </button>
          <p className="text-xs text-stone-400 mt-1 text-center">
            どの段か指定不要。マップ写真と照合してAIが場所を判別します(複数段が写っていてもOK)
          </p>
        </div>
      )}

      {/* 写真マップ */}
      {maps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((m) => (
          <MapPhotoView
            key={m.id}
            map={m}
            shelves={shelves}
            books={books}
            onSelectRow={(shelfId, row) => setSelected({ shelfId, row })}
            onQuickPhoto={openPicker}
            processingLocations={processingLocations}
          />
        ))}

      <div>
        <input
          ref={mapInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && addMap(e.target.files[0])}
        />
        <button
          className={btnSecondary + ' w-full inline-flex items-center justify-center gap-2'}
          onClick={() => mapInput.current?.click()}
          disabled={uploadingMap}
        >
          <ImagePlus size={16} />
          {uploadingMap ? 'アップロード中…' : '本棚の写真からマップを追加'}
        </button>
        <p className="text-xs text-stone-400 mt-1 text-center">
          壁全体の写真を追加 → 「領域編集」で段の範囲を囲んで棚-段を割り当てられます
        </p>
      </div>

      {/* グリッド(一覧) */}
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
                      <span className="font-bold text-sm text-stone-800">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-700 text-white text-[11px] mr-1.5 align-middle">
                          {shelfCode(shelf)}
                        </span>
                        {shelf.name}
                      </span>
                      <span className="text-xs text-stone-400">{shelfTotal}冊</span>
                    </div>
                    <div className="space-y-1">
                      {total.map((count, i) => {
                        const isProcessing = processingLocations.has(`${shelf.id}:${i + 1}`)
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <button
                              onClick={() => setSelected({ shelfId: shelf.id, row: i + 1 })}
                              className={`flex-1 flex items-center justify-between rounded px-2 py-1 text-xs transition-colors border ${
                                count > 0
                                  ? 'bg-amber-100/70 border-amber-200 text-amber-900 hover:bg-amber-200'
                                  : 'bg-stone-50 border-stone-200 text-stone-400 hover:bg-stone-100'
                              }`}
                            >
                              <span>{shelfCode(shelf)}-{i + 1}</span>
                              <span className="font-medium">{count > 0 ? `${count}冊` : '—'}</span>
                            </button>
                            <button
                              title="写真を撮って登録/更新"
                              onClick={() => openPicker(shelf.id, i + 1)}
                              disabled={isProcessing}
                              className={`shrink-0 w-6 h-6 rounded flex items-center justify-center border text-stone-500 ${
                                isProcessing
                                  ? 'bg-amber-100 border-amber-300 animate-pulse'
                                  : 'bg-white border-stone-200 hover:bg-amber-50 hover:text-amber-700'
                              }`}
                            >
                              <Camera size={13} />
                            </button>
                          </div>
                        )
                      })}
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
