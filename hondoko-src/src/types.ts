import type { Timestamp } from 'firebase/firestore'

export type ShelfGroup = 'メイン' | 'サブ' | '別室'

export interface Shelf {
  id: string
  name: string
  group: ShelfGroup
  rows: number
  order: number
  note?: string
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
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
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

export interface AnalyzeResult {
  books: DetectedBook[]
  note: string
  usage?: { input_tokens: number; output_tokens: number }
}

// 差分レビュー用
export type DiffAction =
  | { type: 'keep'; bookId: string; detected: DetectedBook; position: number }
  | { type: 'add'; detected: DetectedBook; position: number }
  | { type: 'move'; bookId: string; fromLabel: string; detected: DetectedBook; position: number }
  | { type: 'missing'; bookId: string }
