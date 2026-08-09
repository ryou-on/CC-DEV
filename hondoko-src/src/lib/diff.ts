import type { Book, DetectedBook, DiffAction, Shelf } from '../types'
import { titleMatches, normalize } from './text'

export function locationLabel(book: Pick<Book, 'shelfId' | 'row' | 'status'>, shelves: Shelf[]): string {
  if (book.status === 'sold') return '売却済み'
  if (!book.shelfId || book.row == null) return '未配置'
  const shelf = shelves.find((s) => s.id === book.shelfId)
  return shelf ? `${shelf.name} ${book.row}段目` : '不明な棚'
}

function sameBook(d: DetectedBook, b: Book): boolean {
  if (!titleMatches(d.title, b.title)) return false
  // 巻数が両方あって異なるなら別の本(シリーズ物対策)
  const dv = normalize(d.volume)
  const bv = normalize(b.volume)
  if (dv && bv && dv !== bv) return false
  return true
}

// 写真の解析結果と既存データを照合して差分アクションを作る
export function computeDiff(
  detected: DetectedBook[],
  booksInRow: Book[],
  allBooks: Book[],
  shelves: Shelf[],
): DiffAction[] {
  const actions: DiffAction[] = []
  const usedRow = new Set<string>()
  const usedElsewhere = new Set<string>()

  detected.forEach((d, i) => {
    // 1) 同じ段の既存本と照合
    const inRow = booksInRow.find((b) => !usedRow.has(b.id) && sameBook(d, b))
    if (inRow) {
      usedRow.add(inRow.id)
      actions.push({ type: 'keep', bookId: inRow.id, detected: d, position: i })
      return
    }
    // 2) 他の場所にある本(owned/unplaced)と照合 → 移動提案
    const elsewhere = allBooks.find(
      (b) =>
        !usedElsewhere.has(b.id) &&
        b.status !== 'sold' &&
        !booksInRow.some((r) => r.id === b.id) &&
        sameBook(d, b),
    )
    if (elsewhere) {
      usedElsewhere.add(elsewhere.id)
      actions.push({
        type: 'move',
        bookId: elsewhere.id,
        fromLabel: locationLabel(elsewhere, shelves),
        detected: d,
        position: i,
      })
      return
    }
    // 3) 新規
    actions.push({ type: 'add', detected: d, position: i })
  })

  // 4) 段にあったのに写真に写っていない本
  for (const b of booksInRow) {
    if (!usedRow.has(b.id)) actions.push({ type: 'missing', bookId: b.id })
  }
  return actions
}
