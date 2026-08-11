import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import { Camera, Pencil, Trash2, Wand2, X } from 'lucide-react'
import { db, storage } from '../firebase'
import type { Book, MapRegion, Shelf, ShelfMap } from '../types'
import { shelfCode } from '../lib/diff'
import { detectRegions, imageUrlToBase64 } from '../lib/api'
import { getPhotoUrl } from '../lib/photoUrl'
import { Modal, Spinner, btnPrimary, btnSecondary, inputCls } from './ui'

interface DraftRect { x: number; y: number; w: number; h: number }

export function MapPhotoView({
  map,
  shelves,
  books,
  onSelectRow,
  onQuickPhoto,
  processingLocations,
  latestPhotos,
  readOnly = false,
}: {
  map: ShelfMap
  shelves: Shelf[]
  books: Book[]
  onSelectRow: (shelfId: string, row: number) => void
  onQuickPhoto: (shelfId: string, row: number) => void
  processingLocations: Set<string>
  latestPhotos: Map<string, string> // 場所キー(`shelfId:row`) → 最新写真のstoragePath
  readOnly?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<DraftRect | null>(null)
  const [assignRect, setAssignRect] = useState<DraftRect | null>(null)
  const [loadError, setLoadError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  // AI検出した段の候補(青点線)。タップで割り当て
  const [candidates, setCandidates] = useState<DraftRect[]>([])
  const [detecting, setDetecting] = useState(false)
  const pendingCandidateIdx = useRef<number | null>(null)

  const runDetect = async () => {
    if (!url) return
    setDetecting(true)
    try {
      const base64 = await imageUrlToBase64(url, 1600)
      const boxes = await detectRegions(base64)
      // 既存領域と大きく重なる候補は除外
      const overlaps = (a: DraftRect, b: { x: number; y: number; w: number; h: number }) => {
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
        const inter = ix * iy
        return inter / Math.min(a.w * a.h, b.w * b.h) > 0.5
      }
      const fresh = boxes.filter((c) => !map.regions.some((r) => overlaps(c, r)))
      setCandidates(fresh)
      if (fresh.length === 0) alert('新しい段は検出されませんでした(既存の領域と重複)')
    } catch (e) {
      alert(e instanceof Error ? e.message : '検出に失敗しました')
    }
    setDetecting(false)
  }

  // ホバー中の段の写真プレビュー(マウス環境のみ)
  const [hoverPreview, setHoverPreview] = useState<{ key: string; label: string; url: string | null } | null>(null)
  const hoverTimer = useRef<number | undefined>(undefined)

  const startHover = (r: MapRegion, label: string) => {
    if (!window.matchMedia('(hover: hover)').matches) return
    const key = `${r.shelfId}:${r.row}`
    const path = latestPhotos.get(key)
    if (!path) return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(async () => {
      setHoverPreview({ key, label, url: null })
      try {
        const u = await getPhotoUrl(path)
        setHoverPreview((cur) => (cur?.key === key ? { key, label, url: u } : cur))
      } catch {
        setHoverPreview((cur) => (cur?.key === key ? null : cur))
      }
    }, 250)
  }
  const endHover = () => {
    window.clearTimeout(hoverTimer.current)
    setHoverPreview(null)
  }

  useEffect(() => {
    let alive = true
    getDownloadURL(storageRef(storage, map.storagePath))
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setLoadError(true))
    return () => { alive = false }
  }, [map.storagePath])

  const countByLocation = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of books) {
      if (b.status !== 'owned' || !b.shelfId || b.row == null) continue
      const key = `${b.shelfId}:${b.row}`
      m.set(key, (m.get(key) || 0) + 1)
    }
    return m
  }, [books])

  // 棚ごとの領域バウンディングボックス上部に棚番号バッジを表示する
  const shelfBadges = useMemo(() => {
    const byShelf = new Map<string, { minX: number; maxX: number; minY: number }>()
    for (const r of map.regions) {
      const b = byShelf.get(r.shelfId)
      if (!b) byShelf.set(r.shelfId, { minX: r.x, maxX: r.x + r.w, minY: r.y })
      else {
        b.minX = Math.min(b.minX, r.x)
        b.maxX = Math.max(b.maxX, r.x + r.w)
        b.minY = Math.min(b.minY, r.y)
      }
    }
    return [...byShelf.entries()]
      .map(([shelfId, b]) => {
        const shelf = shelves.find((s) => s.id === shelfId)
        return shelf ? { shelfId, code: shelfCode(shelf), cx: (b.minX + b.maxX) / 2, y: b.minY } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [map.regions, shelves])

  // ポインタ座標を 0〜1 の正規化座標へ
  const toNorm = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editMode) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragStart.current = toNorm(e)
    setDraft(null)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!editMode || !dragStart.current) return
    const p = toNorm(e)
    const s = dragStart.current
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    })
  }
  const onPointerUp = () => {
    if (!editMode || !dragStart.current) return
    dragStart.current = null
    if (draft && draft.w > 0.015 && draft.h > 0.015) {
      setAssignRect(draft)
    }
    setDraft(null)
  }

  const saveRegion = async (shelfId: string, row: number) => {
    if (!assignRect) return
    const region: MapRegion = {
      id: `r${Date.now()}`,
      shelfId,
      row,
      ...assignRect,
    }
    await updateDoc(doc(db, 'hondoko-maps', map.id), {
      regions: [...map.regions, region],
    })
    if (pendingCandidateIdx.current != null) {
      const idx = pendingCandidateIdx.current
      setCandidates((prev) => prev.filter((_, i) => i !== idx))
      pendingCandidateIdx.current = null
    }
    setAssignRect(null)
  }

  const removeRegion = async (region: MapRegion) => {
    const shelf = shelves.find((s) => s.id === region.shelfId)
    const label = shelf ? `${shelfCode(shelf)}-${region.row}` : '?'
    if (!confirm(`領域「${label}」を削除しますか？(本のデータは消えません)`)) return
    await updateDoc(doc(db, 'hondoko-maps', map.id), {
      regions: map.regions.filter((r) => r.id !== region.id),
    })
  }

  const removeMap = async () => {
    if (!confirm(`マップ「${map.name}」を削除しますか？(本のデータは消えません)`)) return
    await deleteDoc(doc(db, 'hondoko-maps', map.id))
  }

  if (loadError) return null

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100">
        <h3 className="font-bold text-sm text-stone-700">{map.name}</h3>
        <div className="flex items-center gap-1">
          {editMode && (
            <>
              <button
                className="text-xs px-2.5 py-1 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 inline-flex items-center gap-1 disabled:opacity-50"
                onClick={runDetect}
                disabled={detecting}
              >
                <Wand2 size={12} /> {detecting ? 'AI検出中…(30秒前後)' : 'AIで段を検出'}
              </button>
              <button className="p-1.5 text-stone-400 hover:text-red-600" onClick={removeMap} title="マップを削除">
                <Trash2 size={15} />
              </button>
            </>
          )}
          {!readOnly && (
            <button
              className={`text-xs px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${
                editMode ? 'bg-amber-700 text-white border-amber-700' : 'border-stone-300 text-stone-500 hover:bg-stone-50'
              }`}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? <><X size={12} />完了</> : <><Pencil size={12} />領域編集</>}
            </button>
          )}
        </div>
      </div>

      {editMode && (
        <p className="text-xs text-amber-800 bg-amber-50 px-3 py-1.5">
          「AIで段を検出」→ 青い候補をタップで割り当てが簡単です。手動の場合はドラッグで範囲を囲んでください。既存領域はタップで削除。
        </p>
      )}

      {!url ? (
        <Spinner />
      ) : (
        <div
          ref={containerRef}
          className="relative select-none"
          style={{ touchAction: editMode ? 'none' : 'auto' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img src={url} alt={map.name} className="w-full block" draggable={false} />

          {map.regions.map((r) => {
            const shelf = shelves.find((s) => s.id === r.shelfId)
            const count = countByLocation.get(`${r.shelfId}:${r.row}`) || 0
            const isProcessing = processingLocations.has(`${r.shelfId}:${r.row}`)
            const label = shelf ? `${shelfCode(shelf)}-${r.row}` : '?'
            return (
              <div
                key={r.id}
                className={`absolute rounded border-2 transition-colors cursor-pointer ${
                  isProcessing
                    ? 'border-blue-400 bg-blue-400/25 animate-pulse'
                    : count > 0
                    ? 'border-amber-400 bg-amber-400/25 hover:bg-amber-400/40'
                    : 'border-white/50 bg-black/10 hover:bg-black/20 border-dashed'
                }`}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (editMode) removeRegion(r)
                  else onSelectRow(r.shelfId, r.row)
                }}
                onMouseEnter={() => !editMode && startHover(r, label)}
                onMouseLeave={endHover}
              >
                <span
                  className={`absolute top-0.5 left-0.5 text-[10px] sm:text-xs font-bold px-1 py-px rounded leading-tight ${
                    count > 0 ? 'bg-amber-500 text-white' : 'bg-black/40 text-white'
                  }`}
                >
                  {label}{count > 0 ? ` · ${count}` : ''}
                </span>
                {!editMode && !readOnly && (
                  <span
                    role="button"
                    title="写真を撮って登録/更新"
                    className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 text-amber-700 border border-amber-300 flex items-center justify-center shadow hover:bg-amber-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isProcessing) onQuickPhoto(r.shelfId, r.row)
                    }}
                  >
                    <Camera size={11} />
                  </span>
                )}
              </div>
            )
          })}

          {/* ホバー中の段の写真プレビュー */}
          {hoverPreview && (
            <div className="absolute inset-x-2 top-2 z-10 pointer-events-none">
              <div className="bg-white/95 rounded-xl shadow-xl border border-stone-200 p-2">
                <p className="text-xs font-bold text-stone-600 mb-1">{hoverPreview.label} の登録写真</p>
                {hoverPreview.url ? (
                  <img src={hoverPreview.url} alt="" className="w-full max-h-72 object-contain rounded-lg" />
                ) : (
                  <p className="text-xs text-stone-400 py-6 text-center">読み込み中…</p>
                )}
              </div>
            </div>
          )}

          {/* 棚番号バッジ */}
          {shelfBadges.map((b) => (
            <span
              key={b.shelfId}
              className="absolute -translate-x-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-red-500/90 text-white text-[11px] sm:text-xs font-bold flex items-center justify-center shadow pointer-events-none"
              style={{ left: `${b.cx * 100}%`, top: `calc(${b.y * 100}% - 10px)` }}
            >
              {b.code}
            </span>
          ))}

          {/* AI検出候補(編集モードのみ、タップで割り当て) */}
          {editMode && candidates.map((c, i) => (
            <button
              key={`cand-${i}`}
              className="absolute rounded border-2 border-dashed border-blue-500 bg-blue-400/15 hover:bg-blue-400/30"
              style={{
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                width: `${c.w * 100}%`,
                height: `${c.h * 100}%`,
              }}
              onClick={(e) => {
                e.stopPropagation()
                pendingCandidateIdx.current = i
                setAssignRect(c)
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="absolute top-0.5 left-0.5 text-[10px] font-bold px-1 py-px rounded bg-blue-600 text-white">
                候補
              </span>
            </button>
          ))}

          {draft && (
            <div
              className="absolute border-2 border-blue-400 bg-blue-400/20 rounded pointer-events-none"
              style={{
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.w * 100}%`,
                height: `${draft.h * 100}%`,
              }}
            />
          )}
        </div>
      )}

      {assignRect && (
        <AssignModal
          shelves={shelves}
          existing={map.regions}
          onSave={saveRegion}
          onClose={() => { pendingCandidateIdx.current = null; setAssignRect(null) }}
        />
      )}
    </div>
  )
}

function AssignModal({
  shelves,
  existing,
  onSave,
  onClose,
}: {
  shelves: Shelf[]
  existing: MapRegion[]
  onSave: (shelfId: string, row: number) => void
  onClose: () => void
}) {
  // 未割り当ての棚×段を初期候補にする
  const firstFree = (() => {
    for (const s of shelves) {
      for (let r = 1; r <= s.rows; r++) {
        if (!existing.some((e) => e.shelfId === s.id && e.row === r)) return { shelfId: s.id, row: r }
      }
    }
    return { shelfId: shelves[0]?.id ?? '', row: 1 }
  })()
  const [shelfId, setShelfId] = useState(firstFree.shelfId)
  const [row, setRow] = useState(firstFree.row)
  const shelf = shelves.find((s) => s.id === shelfId)
  const duplicate = existing.some((e) => e.shelfId === shelfId && e.row === row)

  return (
    <Modal title="この領域はどの段？" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <select className={inputCls} value={shelfId} onChange={(e) => { setShelfId(e.target.value); setRow(1) }}>
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>{shelfCode(s)}: {s.name}</option>
            ))}
          </select>
          <select className={inputCls} value={row} onChange={(e) => setRow(Number(e.target.value))}>
            {Array.from({ length: shelf?.rows ?? 0 }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>{r}段目</option>
            ))}
          </select>
        </div>
        {shelf && (
          <p className="text-sm text-stone-500">
            表記: <span className="font-bold text-amber-700">{shelfCode(shelf)}-{row}</span>
            {duplicate && <span className="text-orange-600 ml-2">※この段の領域は既にあります(複数登録も可)</span>}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>キャンセル</button>
          <button className={btnPrimary} onClick={() => onSave(shelfId, row)} disabled={!shelfId}>割り当てる</button>
        </div>
      </div>
    </Modal>
  )
}
