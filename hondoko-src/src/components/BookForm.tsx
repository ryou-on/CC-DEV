import { useState } from 'react'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { X } from 'lucide-react'
import { db } from '../firebase'
import type { Book, BookKind, BookStatus, Shelf } from '../types'
import { Modal, inputCls, btnPrimary, btnSecondary } from './ui'

// 著者文字列を個人単位に分割。
// 「株式会社竹尾 (著), 織咲 誠 (著), 原研哉＋日本デザインセンター (著)」のような
// Amazon/書誌サイトからの雑なコピペでも (著)(編)(訳)等の役割注記を除去して切り分ける
const AUTHOR_ROLE = '著|共著|編著|編集|編|訳|共訳|監訳|翻訳|監修|監|イラスト|絵|文|画|写真|撮影|原作|原案|解説|校注'
const splitAuthors = (s: string) =>
  s
    .replace(new RegExp(`[((]\\s*(${AUTHOR_ROLE})(\\s*[・,、/]\\s*(${AUTHOR_ROLE}))*\\s*[))]`, 'g'), ',')
    .split(/[、,,;;/／]/)
    .map((a) => a.trim().replace(new RegExp(`[\\s/／]+(${AUTHOR_ROLE})$`), '').trim())
    .filter(Boolean)

const KIND_LABEL: Record<BookKind, string> = {
  book: '書籍',
  comic: '漫画',
  magazine: '雑誌',
  other: 'その他',
}

export function BookForm({
  book,
  shelves,
  initial,
  onClose,
}: {
  book: Book | null // null = 新規
  shelves: Shelf[]
  initial?: Partial<Book>
  onClose: () => void
}) {
  const base = book ?? initial ?? {}
  const [title, setTitle] = useState(base.title ?? '')
  const [authors, setAuthors] = useState<string[]>(splitAuthors(base.author ?? ''))
  const [authorInput, setAuthorInput] = useState('')
  const [publisher, setPublisher] = useState(base.publisher ?? '')
  const [volume, setVolume] = useState(base.volume ?? '')
  const [isbn, setIsbn] = useState(base.isbn ?? '')
  const [kind, setKind] = useState<BookKind>(base.kind ?? 'book')
  const [tagsText, setTagsText] = useState((base.tags ?? []).join(' '))
  const [memo, setMemo] = useState(base.memo ?? '')
  const [purchaseDate, setPurchaseDate] = useState(base.purchaseDate ?? '')
  const [status, setStatus] = useState<BookStatus>(base.status ?? 'owned')
  const [shelfId, setShelfId] = useState<string>(base.shelfId ?? '')
  const [row, setRow] = useState<number>(base.row ?? 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedShelf = shelves.find((s) => s.id === shelfId)

  // 入力中のテキストも取り込んで著者リストを確定(重複除去)
  const commitAuthorInput = (list: string[], input: string) => {
    const merged = [...list, ...splitAuthors(input)]
    return merged.filter((a, i) => merged.indexOf(a) === i)
  }
  const addAuthor = () => {
    if (!authorInput.trim()) return
    setAuthors((prev) => commitAuthorInput(prev, authorInput))
    setAuthorInput('')
  }

  const save = async () => {
    if (!title.trim()) { setError('タイトルは必須です'); return }
    setSaving(true)
    setError('')
    const tags = tagsText.split(/[\s,、]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean)
    const data = {
      title: title.trim(),
      author: commitAuthorInput(authors, authorInput).join('、'),
      publisher: publisher.trim(),
      volume: volume.trim(),
      isbn: isbn.trim(),
      kind,
      tags,
      memo: memo.trim(),
      purchaseDate,
      status,
      shelfId: status === 'owned' && shelfId ? shelfId : null,
      row: status === 'owned' && shelfId ? row : null,
      updatedAt: serverTimestamp(),
    }
    try {
      if (book) {
        await updateDoc(doc(db, 'hondoko-books', book.id), data)
      } else {
        await addDoc(collection(db, 'hondoko-books'), {
          ...data,
          position: 999,
          confidence: 'high',
          source: base.source ?? 'manual',
          createdAt: serverTimestamp(),
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <Modal title={book ? '本を編集' : '本を追加'} onClose={onClose} closeOnOverlay={false}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-stone-500">タイトル *</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">著者(複数可)</label>
          {authors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 mb-1.5">
              {authors.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200"
                >
                  {a}
                  <button
                    onClick={() => setAuthors((prev) => prev.filter((x) => x !== a))}
                    className="text-sky-400 hover:text-sky-700"
                    title="削除"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addAuthor() }
              }}
              onBlur={addAuthor}
              placeholder={authors.length > 0 ? '著者を追加…' : '著者名(「、」区切りで複数可)'}
            />
            <button className={btnSecondary} onClick={addAuthor} disabled={!authorInput.trim()}>
              追加
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">出版社</label>
          <input className={inputCls} value={publisher} onChange={(e) => setPublisher(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">巻数</label>
            <input className={inputCls} value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="3 / 上" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">種別</label>
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as BookKind)}>
              {(Object.keys(KIND_LABEL) as BookKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">ISBN</label>
            <input className={inputCls} value={isbn} onChange={(e) => setIsbn(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">タグ(スペース区切り)</label>
          <input className={inputCls} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="ビジネス AI デザイン" />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">状態と場所</label>
          <div className="flex gap-2 mt-1">
            {(['owned', 'unplaced', 'sold'] as BookStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${status === s ? 'bg-amber-700 text-white border-amber-700' : 'bg-white border-stone-300 text-stone-600'}`}
              >
                {s === 'owned' ? '棚にある' : s === 'unplaced' ? '未配置' : '売却済み'}
              </button>
            ))}
          </div>
          {status === 'owned' && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <select className={inputCls} value={shelfId} onChange={(e) => setShelfId(e.target.value)}>
                <option value="">棚を選択…</option>
                {shelves.map((s) => (
                  <option key={s.id} value={s.id}>{s.group}: {s.name}</option>
                ))}
              </select>
              <select className={inputCls} value={row} onChange={(e) => setRow(Number(e.target.value))} disabled={!selectedShelf}>
                {Array.from({ length: selectedShelf?.rows ?? 0 }, (_, i) => i + 1).map((r) => (
                  <option key={r} value={r}>{r}段目</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">購入日(不明なら空欄)</label>
            <input type="date" className={inputCls} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">メモ</label>
          <textarea className={inputCls} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className={btnSecondary} onClick={onClose}>キャンセル</button>
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export { KIND_LABEL }
