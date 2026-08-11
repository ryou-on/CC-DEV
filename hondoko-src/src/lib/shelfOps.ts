import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { Book, Shelf } from '../types'

export const MAX_ROWS = 12

// 棚の段数を変更する。減らす場合、削除される段に本が残っていたら中止する
export async function changeShelfRows(
  shelf: Shelf,
  newRows: number,
  books: Book[],
): Promise<{ ok: boolean; message?: string }> {
  if (newRows < 1 || newRows > MAX_ROWS) return { ok: false, message: `段数は1〜${MAX_ROWS}で指定してください` }
  if (newRows === shelf.rows) return { ok: true }
  if (newRows < shelf.rows) {
    const blocked = books.filter(
      (b) => b.status === 'owned' && b.shelfId === shelf.id && b.row != null && b.row > newRows,
    )
    if (blocked.length > 0) {
      return {
        ok: false,
        message: `${shelf.name} の ${newRows + 1}段目以降に ${blocked.length} 冊登録されています。\n先に本を移動(または未配置に)してから段数を減らしてください`,
      }
    }
  }
  await updateDoc(doc(db, 'hondoko-shelves', shelf.id), { rows: newRows })
  return { ok: true }
}
