import { auth, ANALYZE_ENDPOINT } from '../firebase'
import type { AnalyzeResult, MapMatchPayload } from '../types'

// 画像を長辺 maxEdge px 以下の JPEG (base64) に変換
export async function resizeImageToBase64(file: File, maxEdge = 2400): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.split(',')[1]
}

export async function analyzePhoto(base64Jpeg: string, map?: MapMatchPayload): Promise<AnalyzeResult> {
  const user = auth.currentUser
  if (!user) throw new Error('ログインが必要です')
  const idToken = await user.getIdToken()
  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ image: base64Jpeg, mediaType: 'image/jpeg', ...(map ? { map } : {}) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `解析に失敗しました (${res.status})`)
  return data as AnalyzeResult
}

// StorageのマップをAI照合用に縮小したbase64にする
export async function buildMapPayload(
  mapUrl: string,
  regions: MapMatchPayload['regions'],
  maxEdge = 1400,
): Promise<MapMatchPayload> {
  const res = await fetch(mapUrl)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { image: canvas.toDataURL('image/jpeg', 0.8).split(',')[1], regions }
}

// openBD → Google Books の順で ISBN から書誌情報を取得
export interface IsbnInfo {
  title: string
  author: string
  publisher: string
}

export async function lookupIsbn(isbn: string): Promise<IsbnInfo | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, '')
  if (clean.length !== 10 && clean.length !== 13) return null
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${clean}`)
    const arr = await res.json()
    const s = arr?.[0]?.summary
    if (s?.title) {
      return {
        title: s.title,
        author: (s.author || '').replace(/\/(著|訳|編|監修)/g, '').trim(),
        publisher: s.publisher || '',
      }
    }
  } catch { /* fallthrough */ }
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`)
    const data = await res.json()
    const v = data?.items?.[0]?.volumeInfo
    if (v?.title) {
      return {
        title: v.title,
        author: (v.authors || []).join('、'),
        publisher: v.publisher || '',
      }
    }
  } catch { /* ignore */ }
  return null
}
