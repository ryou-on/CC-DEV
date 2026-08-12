import { auth, AMAZON_ENDPOINT, ANALYZE_ENDPOINT } from '../firebase'
import type { AnalyzeResult, MapMatchPayload } from '../types'

// 縮小画像のエッジ方向から傾き角(ラジアン)を推定する。
// 本棚写真は棚板(水平線)と背表紙(垂直線)が支配的なので、
// 軸からのずれのヒストグラムのピークを傾きとみなす。補正対象は±10°まで。
function estimateTiltRad(bitmap: ImageBitmap): number {
  const targetW = 480
  const sc = Math.min(1, targetW / bitmap.width)
  const w = Math.max(32, Math.round(bitmap.width * sc))
  const h = Math.max(32, Math.round(bitmap.height * sc))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114
  }
  const BIN = 0.25 // ヒストグラムの刻み(度)
  const RANGE = 12 // 探索範囲 ±12°
  const bins = new Float32Array(Math.round((RANGE * 2) / BIN) + 1)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx =
        gray[i + 1 - w] + 2 * gray[i + 1] + gray[i + 1 + w] -
        (gray[i - 1 - w] + 2 * gray[i - 1] + gray[i - 1 + w])
      const gy =
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] -
        (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1])
      const mag2 = gx * gx + gy * gy
      if (mag2 < 2500) continue // 弱いエッジは無視
      const deg = (Math.atan2(gy, gx) * 180) / Math.PI
      let tilt = ((deg % 90) + 90) % 90 // 0..90 (水平・垂直どちらの軸ずれも同じ値になる)
      if (tilt > 45) tilt -= 90 // -45..45
      if (Math.abs(tilt) > RANGE) continue
      bins[Math.round((tilt + RANGE) / BIN)] += Math.sqrt(mag2)
    }
  }
  let best = 0
  let bestV = 0
  for (let i = 1; i < bins.length - 1; i++) {
    const v = bins[i - 1] + bins[i] + bins[i + 1]
    if (v > bestV) { bestV = v; best = i }
  }
  const total = bins.reduce((a, b) => a + b, 0)
  if (total === 0 || bestV < total * 0.1) return 0 // 支配的な向きがなければ補正しない
  const angleDeg = best * BIN - RANGE
  if (Math.abs(angleDeg) < 0.4 || Math.abs(angleDeg) > 10) return 0
  return (angleDeg * Math.PI) / 180
}

// 画像を長辺 maxEdge px 以下の JPEG (base64) に変換。
// straighten=true で傾きを自動補正(回転で生じる余白は少しズームして切り落とす)
export async function resizeImageToBase64(file: File, maxEdge = 2400, straighten = false): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  let angle = 0
  if (straighten) {
    try { angle = estimateTiltRad(bitmap) } catch { angle = 0 }
  }
  if (angle !== 0) {
    const s = Math.abs(Math.sin(angle))
    const c = Math.abs(Math.cos(angle))
    // 回転後も枠内を埋める最大の同アスペクト矩形に合わせてズーム
    const k = Math.min(w / (w * c + h * s), h / (w * s + h * c))
    const z = 1 / k
    ctx.translate(w / 2, h / 2)
    ctx.rotate(-angle)
    ctx.drawImage(bitmap, (-w * z) / 2, (-h * z) / 2, w * z, h * z)
  } else {
    ctx.drawImage(bitmap, 0, 0, w, h)
  }
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

// ISBN-13 → ISBN-10 変換(978プレフィックスのみ可)
function isbn13to10(isbn13: string): string | null {
  if (!/^978\d{10}$/.test(isbn13)) return null
  const core = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i])
  const r = (11 - (sum % 11)) % 11
  return core + (r === 10 ? 'X' : String(r))
}

// AmazonのISBN-10ベース書影URL(非公式・キー不要。画像が無い本は1x1画像が返る)
function amazonCoverUrl(isbn: string): string | null {
  const clean = isbn.replace(/[^0-9Xx]/g, '')
  const isbn10 =
    clean.length === 10 ? clean.toUpperCase() : clean.length === 13 ? isbn13to10(clean) : null
  return isbn10 ? `https://images-fe.ssl-images-amazon.com/images/P/${isbn10}.09.LZZZZZZZ.jpg` : null
}

// 画像URLが実在する(1x1プレースホルダでない)ことを確認
function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = window.setTimeout(() => resolve(false), 8000)
    img.onload = () => { window.clearTimeout(timer); resolve(img.naturalWidth > 1 && img.naturalHeight > 1) }
    img.onerror = () => { window.clearTimeout(timer); resolve(false) }
    img.src = url
  })
}

// Amazon PA-API(Cloud Functions経由、アソシエイト設定済みのとき有効)
// 未デプロイ・未設定・レート制限などは null を返して静かにスキップ
let paapiDisabledUntil = 0
async function lookupAmazonPaapi(book: { isbn: string; title: string; author: string }): Promise<{ coverUrl: string | null; price: number | null } | null> {
  if (Date.now() < paapiDisabledUntil) return null
  const user = auth.currentUser
  if (!user) return null
  try {
    const clean = book.isbn.replace(/[^0-9Xx]/g, '')
    const isbn10 = clean.length === 10 ? clean.toUpperCase() : clean.length === 13 ? isbn13to10(clean) : null
    const idToken = await user.getIdToken()
    const res = await fetch(AMAZON_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ isbn: isbn10, title: book.title, author: book.author }),
    })
    if (res.status === 429) { paapiDisabledUntil = Date.now() + 60_000; return null }
    if (!res.ok) {
      // 関数未デプロイ(404)や未設定(500)は10分間スキップ
      paapiDisabledUntil = Date.now() + 10 * 60_000
      return null
    }
    return await res.json()
  } catch {
    return null
  }
}

// 定価+書影+ISBNをまとめて取得(openBDは1リクエストで両方取れる)
export interface BookInfo {
  price: number | null
  coverUrl: string | null
  isbn?: string
  usedPaapi?: boolean // PA-APIを使った場合(一括処理のレート調整用)
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

  // フォールバック3: Amazonの書影画像URL(ISBNベース、キー不要)
  if (coverUrl == null) {
    const az = amazonCoverUrl(isbn || foundIsbn || '')
    if (az && (await probeImage(az))) coverUrl = az
  }

  // フォールバック4: Amazon PA-API(アソシエイト設定済みのとき。ISBNなし本にも効く)
  let usedPaapi = false
  if (coverUrl == null || price == null) {
    const az = await lookupAmazonPaapi({ ...book, isbn: isbn || foundIsbn || '' })
    if (az) {
      usedPaapi = true
      if (coverUrl == null && az.coverUrl) coverUrl = az.coverUrl
      if (price == null && az.price != null) price = az.price
    }
  }

  return { price, coverUrl, isbn: foundIsbn, usedPaapi }
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
