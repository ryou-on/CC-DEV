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

// 画像URLを縮小base64にする
export async function imageUrlToBase64(url: string, maxEdge = 1400): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
}

// StorageのマップをAI照合用に縮小したbase64にする
export async function buildMapPayload(
  mapUrl: string,
  regions: MapMatchPayload['regions'],
  maxEdge = 1400,
): Promise<MapMatchPayload> {
  return { image: await imageUrlToBase64(mapUrl, maxEdge), regions }
}

// マップ写真から段の矩形をAI検出する
export async function detectRegions(base64Jpeg: string): Promise<{ x: number; y: number; w: number; h: number }[]> {
  const user = auth.currentUser
  if (!user) throw new Error('ログインが必要です')
  const idToken = await user.getIdToken()
  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ mode: 'detect_regions', image: base64Jpeg, mediaType: 'image/jpeg' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `検出に失敗しました (${res.status})`)
  return data.boxes || []
}

// openBD → Google Books の順で ISBN から書誌情報を取得
export interface IsbnInfo {
  title: string
  author: string
  publisher: string
}

// openBDのonixから定価(円)を取り出す
function openBdPrice(item: unknown): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = (item as any)?.onix?.ProductSupply?.SupplyDetail?.Price
    if (Array.isArray(prices)) {
      for (const p of prices) {
        const n = parseInt(p?.PriceAmount, 10)
        if (Number.isFinite(n) && n > 0) return n
      }
    }
  } catch { /* ignore */ }
  return null
}

export interface PriceInfo {
  price: number | null
  isbn?: string // Google Booksから逆引きできた場合(ISBN未登録本の補完用)
  coverUrl?: string
}

// 定価+書影+ISBNをまとめて取得(openBDは1リクエストで両方取れる)
export interface BookInfo {
  price: number | null
  coverUrl: string | null
  isbn?: string
}

export async function lookupBookInfo(book: { isbn: string; title: string; author: string }): Promise<BookInfo> {
  const isbn = book.isbn.replace(/[^0-9Xx]/g, '')
  let price: number | null = null
  let coverUrl: string | null = null
  let foundIsbn: string | undefined

  if (isbn.length === 10 || isbn.length === 13) {
    try {
      const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
      const arr = await res.json()
      price = openBdPrice(arr?.[0])
      coverUrl = arr?.[0]?.summary?.cover || null
    } catch { /* fallthrough */ }
  }

  if (price == null || coverUrl == null) {
    try {
      const q = isbn
        ? `isbn:${isbn}`
        : `intitle:${JSON.stringify(book.title)}${book.author ? `+inauthor:${JSON.stringify(book.author.split(/[、,]/)[0])}` : ''}`
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&country=JP`)
      const data = await res.json()
      const item = data?.items?.[0]
      if (item) {
        const amount = item.saleInfo?.listPrice?.amount
        if (price == null && typeof amount === 'number' && amount > 0) price = Math.round(amount)
        const thumb = item.volumeInfo?.imageLinks?.thumbnail
        if (coverUrl == null && thumb) coverUrl = String(thumb).replace(/^http:/, 'https:')
        if (!isbn) {
          foundIsbn = (item.volumeInfo?.industryIdentifiers ?? []).find(
            (x: { type: string }) => x.type === 'ISBN_13' || x.type === 'ISBN_10',
          )?.identifier
          // 逆引きしたISBNでopenBDをもう一度(日本の書籍は書影・定価の精度が上がる)
          if (foundIsbn && (price == null || coverUrl == null)) {
            try {
              const r2 = await fetch(`https://api.openbd.jp/v1/get?isbn=${foundIsbn}`)
              const a2 = await r2.json()
              if (price == null) price = openBdPrice(a2?.[0])
              if (coverUrl == null) coverUrl = a2?.[0]?.summary?.cover || null
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
  }

  return { price, coverUrl, isbn: foundIsbn }
}

// 定価を取得: openBD(ISBN) → Google Books(ISBN or タイトル+著者)
// Google Booksの結果からISBN・書影も拾えたら返す(補完用)
export async function lookupPrice(book: { isbn: string; title: string; author: string }): Promise<PriceInfo> {
  const isbn = book.isbn.replace(/[^0-9Xx]/g, '')
  if (isbn.length === 10 || isbn.length === 13) {
    try {
      const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
      const arr = await res.json()
      const price = openBdPrice(arr?.[0])
      if (price != null) return { price }
    } catch { /* fallthrough */ }
  }
  try {
    const q = isbn
      ? `isbn:${isbn}`
      : `intitle:${JSON.stringify(book.title)}${book.author ? `+inauthor:${JSON.stringify(book.author.split(/[、,]/)[0])}` : ''}`
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&country=JP`)
    const data = await res.json()
    const item = data?.items?.[0]
    if (!item) return { price: null }
    const amount = item.saleInfo?.listPrice?.amount
    const foundIsbn = (item.volumeInfo?.industryIdentifiers ?? []).find(
      (x: { type: string }) => x.type === 'ISBN_13' || x.type === 'ISBN_10',
    )?.identifier
    const thumb = item.volumeInfo?.imageLinks?.thumbnail
    // Google Booksで見つかったISBNがあれば openBD でもう一度定価を引く
    let price: number | null = typeof amount === 'number' && amount > 0 ? Math.round(amount) : null
    if (price == null && foundIsbn && !isbn) {
      try {
        const r2 = await fetch(`https://api.openbd.jp/v1/get?isbn=${foundIsbn}`)
        const a2 = await r2.json()
        price = openBdPrice(a2?.[0])
      } catch { /* ignore */ }
    }
    return {
      price,
      isbn: !isbn && foundIsbn ? String(foundIsbn) : undefined,
      coverUrl: thumb ? String(thumb).replace(/^http:/, 'https:') : undefined,
    }
  } catch { /* ignore */ }
  return { price: null }
}

// 書影URLを取得: openBD(ISBN) → Google Books(ISBN or タイトル+著者)
export async function lookupCover(book: { isbn: string; title: string; author: string }): Promise<string | null> {
  const isbn = book.isbn.replace(/[^0-9Xx]/g, '')
  if (isbn.length === 10 || isbn.length === 13) {
    try {
      const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
      const arr = await res.json()
      const cover = arr?.[0]?.summary?.cover
      if (cover) return cover
    } catch { /* fallthrough */ }
  }
  try {
    const q = isbn
      ? `isbn:${isbn}`
      : `intitle:${JSON.stringify(book.title)}${book.author ? `+inauthor:${JSON.stringify(book.author.split(/[、,]/)[0])}` : ''}`
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&country=JP`)
    const data = await res.json()
    const thumb = data?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail
    if (thumb) return String(thumb).replace(/^http:/, 'https:')
  } catch { /* ignore */ }
  return null
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
