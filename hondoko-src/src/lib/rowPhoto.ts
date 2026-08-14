// 段写真の解決: 複数段が1枚に写っている写真は、AIの段検出で切り出し枠を求めて
// その段だけをトリミング表示する。枠は hondoko-photos の cropBox にキャッシュ。
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { ShelfPhoto } from '../types'
import { detectRegions, imageUrlToBase64 } from './api'
import { getPhotoUrl } from './photoUrl'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface RowPhotoResult {
  url: string // 表示用URL(トリミング時はdataURL)
  fullUrl: string // 元写真のURL
  storagePath: string
  cropBox: Box | null // トリミングに使った枠(元写真に対する正規化座標)
}

// boxに少し余白を付けて画像内にクランプ
export function padBox(box: Box, pad = 0.012): Box {
  const x0 = Math.max(0, box.x - pad)
  const y0 = Math.max(0, box.y - pad)
  const x1 = Math.min(1, box.x + box.w + pad)
  const y1 = Math.min(1, box.y + box.h + pad)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// 正規化boxで画像を切り出してdataURLに(boxはそのまま使う)
async function cropToDataUrl(url: string, box: Box): Promise<string> {
  const res = await fetch(url)
  const bmp = await createImageBitmap(await res.blob())
  const sx = box.x * bmp.width
  const sy = box.y * bmp.height
  const sw = Math.max(1, box.w * bmp.width)
  const sh = Math.max(1, box.h * bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw)
  canvas.height = Math.round(sh)
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.88)
}

// 同じ写真に対する検出の同時実行を防ぐ
const detecting = new Set<string>()

export async function resolveRowPhoto(
  photos: ShelfPhoto[],
  shelfId: string,
  row: number,
  allowDetect: boolean,
): Promise<RowPhotoResult | null> {
  const mine = photos
    .filter((p) => p.shelfId === shelfId && p.row === row)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))[0]
  if (!mine) return null
  const fullUrl = await getPhotoUrl(mine.storagePath)
  const full: RowPhotoResult = { url: fullUrl, fullUrl, storagePath: mine.storagePath, cropBox: null }

  // 同じ写真ファイルを共有する段(=1枚に複数段が写っている)を列挙
  const siblingMap = new Map<string, ShelfPhoto>()
  for (const p of photos) {
    if (p.storagePath !== mine.storagePath) continue
    const key = `${p.shelfId}:${p.row}`
    const cur = siblingMap.get(key)
    if (!cur || (p.createdAt?.toMillis() ?? 0) > (cur.createdAt?.toMillis() ?? 0)) siblingMap.set(key, p)
  }
  const siblings = [...siblingMap.values()]
  if (siblings.length <= 1) return full

  let box: Box | null | undefined = mine.cropBox
  if (box === null) return full // 過去に対応付け不能と判定済み

  if (box === undefined) {
    if (!allowDetect || detecting.has(mine.storagePath)) return full
    // 別々の棚にまたがる写真は段順の対応が確定できないため対象外
    if (!siblings.every((s) => s.shelfId === shelfId)) return full
    detecting.add(mine.storagePath)
    try {
      const boxes = (await detectRegions(await imageUrlToBase64(fullUrl, 1400)))
        .slice()
        .sort((a, b) => a.y - b.y)
      const ordered = siblings.slice().sort((a, b) => a.row - b.row) // 段番号は上から下
      if (boxes.length === ordered.length) {
        await Promise.all(
          ordered.map((s, i) =>
            updateDoc(doc(db, 'hondoko-photos', s.id), { cropBox: boxes[i] }).catch(() => {}),
          ),
        )
        box = boxes[ordered.findIndex((s) => s.id === mine.id)] ?? null
      } else {
        // 検出数と段数が合わない → 全体表示で確定(再検出しない)
        await Promise.all(
          siblings.map((s) => updateDoc(doc(db, 'hondoko-photos', s.id), { cropBox: null }).catch(() => {})),
        )
        box = null
      }
    } catch {
      box = undefined // 一時エラー: 次回また試す
    } finally {
      detecting.delete(mine.storagePath)
    }
  }

  if (!box) return full
  try {
    const padded = padBox(box)
    return { url: await cropToDataUrl(fullUrl, padded), fullUrl, storagePath: mine.storagePath, cropBox: padded }
  } catch {
    return full
  }
}
