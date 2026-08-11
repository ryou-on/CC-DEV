import type { Timestamp } from 'firebase/firestore'

export type ShelfGroup = 'メイン' | 'サブ' | '別室'

export interface Shelf {
  id: string
  name: string
  code?: string // 棚番号(「1-3」表記の「1」部分)。未設定なら order+1
  group: ShelfGroup
  rows: number
  order: number
  note?: string
}

// マップ写真上の領域(座標は画像に対する 0〜1 の正規化値)
export interface MapRegion {
  id: string
  shelfId: string
  row: number
  x: number
  y: number
  w: number
  h: number
}

export interface ShelfMap {
  id: string
  name: string
  storagePath: string
  regions: MapRegion[]
  order: number
  createdAt: Timestamp | null
}

export type BookStatus = 'owned' | 'sold' | 'unplaced'
export type BookKind = 'book' | 'comic' | 'magazine' | 'other'
export type BookSource = 'photo' | 'isbn' | 'manual' | 'csv'

export interface Book {
  id: string
  title: string
  author: string
  publisher: string
  volume: string
  isbn: string
  kind: BookKind
  tags: string[]
  shelfId: string | null
  row: number | null
  position: number
  status: BookStatus
  confidence: 'high' | 'medium' | 'low'
  memo: string
  source: BookSource
  // 書影URL。undefined=未取得, ''=取得を試みたが見つからず
  coverUrl?: string
  // 既読管理・評価・価格(v1.7〜)
  readStatus?: 'unread' | 'read'
  rating?: number // 0=未評価, 1〜5
  purchasePrice?: number | null // 購入価格(円)
  resalePrice?: number | null // 想定売値(円)
  // 定価(円)。undefined=未取得, null=取得を試みたが見つからず(自動取得: openBD/Google Books)
  listPrice?: number | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

// 公開設定 (hondoko-config/sharing)
export type SharingMode = 'private' | 'viewers' | 'link' | 'public'
export interface SharingConfig {
  mode: SharingMode
  viewers: string[] // mode=viewers のとき閲覧を許可するGoogleアカウント
  allowComments: boolean
  linkKey: string // mode=link のときURLに付けるキー(?k=)
}

export interface BookComment {
  id: string
  bookId: string
  text: string
  by: string // メールアドレス
  byName: string
  createdAt: Timestamp | null
}

export interface ShelfPhoto {
  id: string
  shelfId: string
  row: number
  storagePath: string
  bookCount: number
  addedCount: number
  removedCount: number
  movedCount: number
  by: string
  createdAt: Timestamp | null
}

export interface DetectedBook {
  title: string
  author: string
  publisher: string
  volume: string
  kind: BookKind
  tags: string[]
  confidence: 'high' | 'medium' | 'low'
}

// 写真内の1つの段(上から順)。region はマップ照合で判定された領域ラベル(例: "1-3")
export interface DetectedRow {
  region: string
  books: DetectedBook[]
}

export interface AnalyzeResult {
  rows: DetectedRow[]
  note: string
  usage?: { input_tokens: number; output_tokens: number }
}

export interface MapMatchPayload {
  image: string // base64 jpeg (縮小済み)
  regions: { label: string; x: number; y: number; w: number; h: number }[]
}

// 差分レビュー用
export type DiffAction =
  | { type: 'keep'; bookId: string; detected: DetectedBook; position: number }
  | { type: 'add'; detected: DetectedBook; position: number }
  | { type: 'move'; bookId: string; fromLabel: string; detected: DetectedBook; position: number }
  | { type: 'missing'; bookId: string }
