import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage'
import { auth, storage, AMAZON_ENDPOINT, ANALYZE_ENDPOINT, COVER_ENDPOINT, NDL_ENDPOINT } from '../firebase'
import type { AnalyzeResult, MapMatchPayload } from '../types'
import { rectifyImage } from './rectify'

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
// straighten=true でまず台形(パースペクティブ)補正を試み、
// 推定できない場合は傾き(回転)のみ自動補正する
export async function resizeImageToBase64(file: File, maxEdge = 2400, straighten = false): Promise<string> {
  const bitmap = await createImageBitmap(file)
  if (straighten) {
    try {
      const rectified = rectifyImage(bitmap, maxEdge)
      if (rectified) {
        bitmap.close()
        return rectified.toDataURL('image/jpeg', 0.85).split(',')[1]
      }
    } catch { /* 失敗時は従来の回転補正へ */ }
  }
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
// 段写真から特定の本の背表紙位置をAIで特定(正規化座標)。見つからなければnull
export async function locateBook(
  base64Jpeg: string,
  book: { title: string; author: string; volume?: string },
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const user = auth.currentUser
  if (!user) throw new Error('ログインが必要です')
  const idToken = await user.getIdToken()
  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      mode: 'locate_book',
      image: base64Jpeg,
      mediaType: 'image/jpeg',
      title: book.title,
      author: book.author,
      volume: book.volume || '',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `位置の特定に失敗しました (${res.status})`)
  return data.found ? data.box : null
}

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
  pubDate?: string // 'YYYYMMDD' など。取得できなければ ''
  author?: string // 取得できた著者(著者未登録の本のバックフィル用)
  publisher?: string // 取得できた出版社(同上)
  usedPaapi?: boolean // PA-APIを使った場合(一括処理のレート調整用)
}

// 出版日文字列を数字だけの 'YYYYMMDD' 形式へ正規化
function normPubDate(s: unknown): string {
  if (typeof s !== 'string') return ''
  const digits = s.replace(/[^0-9]/g, '')
  return digits.length >= 4 ? digits.slice(0, 8) : ''
}

// ---- openBD: ISBNから書誌一式(定価・書影・出版日・著者・出版社) ----
interface OpenBdInfo {
  price: number | null
  coverUrl: string | null
  pubDate: string
  author: string
  publisher: string
}

function cleanOpenBdAuthor(s: string): string {
  return s
    .replace(/\/(著|訳|編|編著|監修|監訳|原作|イラスト|絵|文|画)/g, '')
    .replace(/\s*[,,]\s*/g, '、')
    .trim()
}

async function openBdGet(isbn: string): Promise<OpenBdInfo | null> {
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
    const arr = await res.json()
    const item = arr?.[0]
    if (!item) return null
    const s = item.summary || {}
    return {
      price: openBdPrice(item),
      coverUrl: s.cover || null,
      pubDate: normPubDate(s.pubdate),
      author: cleanOpenBdAuthor(String(s.author || '')),
      publisher: String(s.publisher || '').trim(),
    }
  } catch {
    return null
  }
}

// ---- 国立国会図書館(NDL)サーチ: タイトルからISBN・著者・出版社・定価を解決(CORS対応) ----

// 検索クエリ用にタイトルを掃除(OCR注記・カッコ内・号数などを除去)
export function cleanTitleForSearch(title: string): string {
  return title
    .replace(/[((【[][^))】\]]*[))】\]]/g, ' ')
    .replace(/(誌名|タイトル|書名)?一?部?判読不能/g, ' ')
    .replace(/\d{4}年\d{1,2}月号?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 自動取得に使えるタイトルか(掃除後に実質2文字以上残るか)
export function isSearchableTitle(title: string): boolean {
  return cleanTitleForSearch(title).length >= 2
}

// bigram Dice係数(OCRの表記ゆれ対策の類似度)
function bigrams(s: string): Set<string> {
  const r = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2))
  return r
}
function diceSim(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return (2 * hit) / (A.size + B.size)
}

function normTitle(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・::;;,、。..〜~\-ー―‐!!??()()[\]「」『』【】=&&]/g, '')
}

// "四角, 大輔, 1970-" → "四角大輔"(生没年と区切りカンマを除去)
// 欧文名 "Spezzano, Chuck" は "Chuck Spezzano" に並べ替え
function cleanNdlCreator(s: string): string {
  const t = s.replace(/,\s*\d{3,4}-?(\d{3,4})?\.?\s*$/, '').trim()
  const m = /^([A-Za-z'’. -]+),\s*([A-Za-z'’. -]+)$/.exec(t)
  if (m) return `${m[2].trim()} ${m[1].trim()}`
  return t.replace(/,\s*/g, '')
}

// "2022.9" / "2022.10.5" → "20229"ではなく"202209" 形式へ
function ndlDate(s: string): string {
  const m = /^(\d{4})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?/.exec(s.trim())
  if (!m) return ''
  return m[1] + (m[2] ? m[2].padStart(2, '0') : '') + (m[3] ? m[3].padStart(2, '0') : '')
}

interface NdlItem {
  title: string
  author: string
  publisher: string
  isbn: string
  price: number | null
  pubDate: string
}

const DC_NS = 'http://purl.org/dc/elements/1.1/'
const DCNDL_NS = 'http://ndl.go.jp/dcndl/terms/'
const DCTERMS_NS = 'http://purl.org/dc/terms/'

let ndlLastCall = 0
async function ndlThrottle() {
  const wait = ndlLastCall + 400 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  ndlLastCall = Date.now()
}

// itemノード → NdlItem
function parseNdlItem(el: Element): NdlItem {
  const text = (ns: string, tag: string) =>
    Array.from(el.getElementsByTagNameNS(ns, tag)).map((n) => n.textContent?.trim() || '')
  const priceText = text(DCNDL_NS, 'price')[0] || ''
  const priceNum = parseInt(priceText.replace(/[^0-9]/g, ''), 10)
  return {
    title: text(DC_NS, 'title')[0] || '',
    author: text(DC_NS, 'creator').map(cleanNdlCreator).filter(Boolean)
      .filter((a, i, arr) => arr.indexOf(a) === i).join('、'),
    publisher: text(DC_NS, 'publisher')[0] || '',
    isbn: Array.from(el.getElementsByTagNameNS(DC_NS, 'identifier'))
      .filter((n) => (n.getAttribute('xsi:type') || '').includes('ISBN'))
      .map((n) => (n.textContent || '').replace(/[^0-9Xx]/g, ''))
      .find((v) => v.length === 10 || v.length === 13) || '',
    price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
    pubDate: ndlDate(text(DCTERMS_NS, 'issued')[0] || ''),
  }
}

async function ndlFetchItems(params: Record<string, string>): Promise<Element[]> {
  await ndlThrottle()
  let xml: string | null = null
  // 直接アクセスを試す(NDLのCORSヘッダは不安定: 通ることも弾かれることもある)
  try {
    const res = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?${new URLSearchParams(params).toString()}`)
    if (res.ok) xml = await res.text()
  } catch { /* CORSブロック等 → プロキシへ */ }
  // Cloud Function経由のフォールバック
  if (xml == null) {
    const user = auth.currentUser
    if (!user) return []
    try {
      const idToken = await user.getIdToken()
      const res = await fetch(NDL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ params }),
      })
      if (!res.ok) return []
      const data = await res.json()
      if (typeof data?.xml !== 'string') return []
      xml = data.xml
    } catch {
      return []
    }
  }
  if (xml == null) return []
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return Array.from(doc.getElementsByTagName('item'))
}

// ISBNからNDLの書誌を1件取得
async function ndlLookupByIsbn(isbn: string): Promise<NdlItem | null> {
  try {
    const items = await ndlFetchItems({ isbn, cnt: '1' })
    return items.length ? parseNdlItem(items[0]) : null
  } catch {
    return null
  }
}

async function ndlLookup(book: { title: string; author: string }): Promise<NdlItem | null> {
  const cleaned = cleanTitleForSearch(book.title)
  if (cleaned.length < 2) return null
  const nq = normTitle(cleaned)
  if (!nq) return null
  const na = book.author ? normTitle(cleanTitleForSearch(book.author).split(/[、,]/)[0]) : ''

  // クエリ候補: 掃除済みタイトル → だめなら先頭セグメント(サブタイトル前)
  const queries = [cleaned]
  const head = cleaned.split(/[\s::—―〜~]/)[0]
  if (head.length >= 3 && head !== cleaned) queries.push(head)

  try {
    for (const q of queries) {
      const items = await ndlFetchItems({ title: q, cnt: '10' })
      let best: { item: NdlItem; score: number } | null = null
      for (const el of items) {
        const item = parseNdlItem(el)
        const nt = normTitle(item.title)
        if (!nt) continue
        let score = 0
        if (nt === nq) score = 100
        else if (nt.startsWith(nq) || nq.startsWith(nt)) score = 70
        else if (nt.includes(nq) || nq.includes(nt)) score = 50
        else {
          // OCRの表記ゆれ対策: bigram類似度で救済
          const d = diceSim(nt, nq)
          if (d >= 0.6) score = Math.round(35 + d * 30)
          else continue
        }
        if (na && item.author && normTitle(item.author).includes(na)) score += 15
        if (item.isbn) score += 5
        if (!best || score > best.score) best = { item, score }
      }
      if (best && best.score >= 50) return best.item
    }
    return null
  } catch {
    return null
  }
}

// ---- Google Books(レート制限429を検知したら10分間スキップ) ----
let gbDisabledUntil = 0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gbQuery(q: string): Promise<any | null> {
  if (Date.now() < gbDisabledUntil) return null
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&country=JP`)
    if (res.status === 429) { gbDisabledUntil = Date.now() + 10 * 60_000; return null }
    if (!res.ok) return null
    const data = await res.json()
    return data?.items?.[0] ?? null
  } catch {
    return null
  }
}

// ISBN-10 → ISBN-13 変換
function isbn10to13(isbn10: string): string | null {
  if (!/^\d{9}[\dXx]$/.test(isbn10)) return null
  const core = '978' + isbn10.slice(0, 9)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3)
  return core + String((10 - (sum % 10)) % 10)
}

// NDLの書影サムネイル(Refererチェックがあるため関数プロキシ経由)。
// 取得できたらStorageへ保存して永続URLを返す
async function fetchNdlCover(isbn: string): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  const clean = isbn.replace(/[^0-9Xx]/g, '')
  const isbn13 = clean.length === 13 ? clean : clean.length === 10 ? isbn10to13(clean) : null
  if (!isbn13) return null
  try {
    const idToken = await user.getIdToken()
    const res = await fetch(COVER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ isbn: isbn13 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.base64) return null
    const path = `hondoko/covers/ndl-${isbn13}.jpg`
    await uploadString(storageRef(storage, path), data.base64, 'base64', {
      contentType: data.contentType || 'image/jpeg',
    })
    return await getDownloadURL(storageRef(storage, path))
  } catch {
    return null
  }
}

export async function lookupBookInfo(book: { isbn: string; title: string; author: string }): Promise<BookInfo> {
  const isbn = book.isbn.replace(/[^0-9Xx]/g, '')
  let price: number | null = null
  let coverUrl: string | null = null
  let pubDate = ''
  let author = ''
  let publisher = ''
  let foundIsbn: string | undefined

  const applyOpenBd = (o: OpenBdInfo | null) => {
    if (!o) return
    if (price == null) price = o.price
    if (coverUrl == null) coverUrl = o.coverUrl
    if (!pubDate) pubDate = o.pubDate
    if (!author) author = o.author
    if (!publisher) publisher = o.publisher
  }

  const applyNdl = (nd: NdlItem | null) => {
    if (!nd) return
    if (!author) author = nd.author
    if (!publisher) publisher = nd.publisher
    if (price == null) price = nd.price
    if (!pubDate) pubDate = nd.pubDate
  }

  // 1) ISBNがあれば openBD(定価・書影・著者・出版社が一度に取れる)
  if (isbn.length === 10 || isbn.length === 13) {
    applyOpenBd(await openBdGet(isbn))
    // openBDに欠けがあればNDL(ISBN指定)で補完
    if (price == null || !pubDate || !author || !publisher) {
      applyNdl(await ndlLookupByIsbn(isbn))
    }
  } else {
    // 2) ISBN不明 → NDLサーチでタイトルから解決(著者・出版社・定価・ISBNまで取れる)
    const nd = await ndlLookup(book)
    if (nd) {
      foundIsbn = nd.isbn || undefined
      applyNdl(nd)
      if (foundIsbn) applyOpenBd(await openBdGet(foundIsbn))
    }
  }

  // 3) まだ穴があれば Google Books(429中は自動スキップ)
  if (price == null || coverUrl == null || !pubDate || (!isbn && !foundIsbn)) {
    const effIsbn = isbn || foundIsbn
    const cleanedTitle = cleanTitleForSearch(book.title)
    const q = effIsbn
      ? `isbn:${effIsbn}`
      : `intitle:${JSON.stringify(cleanedTitle || book.title)}${book.author ? `+inauthor:${JSON.stringify(book.author.split(/[、,]/)[0])}` : ''}`
    const item = effIsbn || cleanedTitle.length >= 2 ? await gbQuery(q) : null
    if (item) {
      const amount = item.saleInfo?.listPrice?.amount
      if (price == null && typeof amount === 'number' && amount > 0) price = Math.round(amount)
      const thumb = item.volumeInfo?.imageLinks?.thumbnail
      if (coverUrl == null && thumb) coverUrl = String(thumb).replace(/^http:/, 'https:')
      if (!pubDate) pubDate = normPubDate(item.volumeInfo?.publishedDate)
      if (!author && Array.isArray(item.volumeInfo?.authors)) author = item.volumeInfo.authors.join('、')
      if (!publisher && item.volumeInfo?.publisher) publisher = String(item.volumeInfo.publisher).trim()
      if (!isbn && !foundIsbn) {
        const id = (item.volumeInfo?.industryIdentifiers ?? []).find(
          (x: { type: string }) => x.type === 'ISBN_13' || x.type === 'ISBN_10',
        )?.identifier
        if (id) {
          foundIsbn = String(id).replace(/[^0-9Xx]/g, '')
          applyOpenBd(await openBdGet(foundIsbn))
        }
      }
    }
  }

  const effIsbn = isbn || foundIsbn || ''

  // 4) 書影フォールバック: Amazonの画像URL(キー不要) → NDLサムネイル(関数プロキシ)
  if (coverUrl == null) {
    const az = amazonCoverUrl(effIsbn)
    if (az && (await probeImage(az))) coverUrl = az
  }
  if (coverUrl == null && effIsbn) {
    coverUrl = await fetchNdlCover(effIsbn)
  }

  // 5) Amazon PA-API(アソシエイト設定済みのとき。ISBNなし本にも効く)
  let usedPaapi = false
  if (coverUrl == null || price == null) {
    const az = await lookupAmazonPaapi({ ...book, isbn: effIsbn })
    if (az) {
      usedPaapi = true
      if (coverUrl == null && az.coverUrl) coverUrl = az.coverUrl
      if (price == null && az.price != null) price = az.price
    }
  }

  return {
    price,
    coverUrl,
    isbn: foundIsbn,
    pubDate,
    author: author || undefined,
    publisher: publisher || undefined,
    usedPaapi,
  }
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
  // NDLサーチ(ISBN指定)
  try {
    const res = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${clean}&cnt=1`)
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/xml')
      const el = doc.getElementsByTagName('item')[0]
      if (el) {
        const title = el.getElementsByTagNameNS(DC_NS, 'title')[0]?.textContent?.trim() || ''
        if (title) {
          return {
            title,
            author: Array.from(el.getElementsByTagNameNS(DC_NS, 'creator'))
              .map((n) => cleanNdlCreator(n.textContent || '')).filter(Boolean)
              .filter((a, i, arr) => arr.indexOf(a) === i).join('、'),
            publisher: el.getElementsByTagNameNS(DC_NS, 'publisher')[0]?.textContent?.trim() || '',
          }
        }
      }
    }
  } catch { /* ignore */ }
  // Google Books(429中は自動スキップ)
  const item = await gbQuery(`isbn:${clean}`)
  const v = item?.volumeInfo
  if (v?.title) {
    return {
      title: v.title,
      author: (v.authors || []).join('、'),
      publisher: v.publisher || '',
    }
  }
  return null
}
