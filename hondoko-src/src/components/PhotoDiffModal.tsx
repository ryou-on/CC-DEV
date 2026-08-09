import { useRef, useState } from 'react'
import {
  addDoc, collection, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { ref as storageRef, uploadString } from 'firebase/storage'
import { Camera, Check } from 'lucide-react'
import { auth, db, storage } from '../firebase'
import type { Book, DiffAction, Shelf } from '../types'
import { analyzePhoto, resizeImageToBase64 } from '../lib/api'
import { computeDiff } from '../lib/diff'
import { Modal, Spinner, btnPrimary, btnSecondary, inputCls } from './ui'

type MissingChoice = 'unplaced' | 'sold' | 'keep'
type Step = 'pick' | 'analyzing' | 'review' | 'applying' | 'done'

export function PhotoDiffModal({
  shelf,
  row,
  booksInRow,
  allBooks,
  shelves,
  onClose,
}: {
  shelf: Shelf
  row: number
  booksInRow: Book[]
  allBooks: Book[]
  shelves: Shelf[]
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [actions, setActions] = useState<DiffAction[]>([])
  const [enabled, setEnabled] = useState<boolean[]>([])
  const [missingChoices, setMissingChoices] = useState<Record<string, MissingChoice>>({})
  const [summary, setSummary] = useState('')
  const base64Ref = useRef<string>('')
  const fileInput = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')
    setStep('analyzing')
    try {
      const base64 = await resizeImageToBase64(file)
      base64Ref.current = base64
      const result = await analyzePhoto(base64)
      const diff = computeDiff(result.books, booksInRow, allBooks, shelves)
      setNote(result.note)
      setActions(diff)
      setEnabled(diff.map(() => true))
      const mc: Record<string, MissingChoice> = {}
      for (const a of diff) if (a.type === 'missing') mc[a.bookId] = 'unplaced'
      setMissingChoices(mc)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析に失敗しました')
      setStep('pick')
    }
  }

  const apply = async () => {
    setStep('applying')
    try {
      const batch = writeBatch(db)
      const booksCol = collection(db, 'hondoko-books')
      let added = 0, moved = 0, removed = 0, kept = 0

      actions.forEach((a, i) => {
        if (!enabled[i]) return
        if (a.type === 'keep') {
          const existing = booksInRow.find((b) => b.id === a.bookId)
          batch.update(doc(booksCol, a.bookId), {
            position: a.position,
            // タグが未設定なら AI のタグで補完
            ...(existing && existing.tags.length === 0 && a.detected.tags.length > 0
              ? { tags: a.detected.tags }
              : {}),
            updatedAt: serverTimestamp(),
          })
          kept++
        } else if (a.type === 'add') {
          batch.set(doc(booksCol), {
            title: a.detected.title,
            author: a.detected.author,
            publisher: a.detected.publisher,
            volume: a.detected.volume,
            isbn: '',
            kind: a.detected.kind,
            tags: a.detected.tags,
            memo: '',
            status: 'owned',
            shelfId: shelf.id,
            row,
            position: a.position,
            confidence: a.detected.confidence,
            source: 'photo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          added++
        } else if (a.type === 'move') {
          batch.update(doc(booksCol, a.bookId), {
            status: 'owned',
            shelfId: shelf.id,
            row,
            position: a.position,
            updatedAt: serverTimestamp(),
          })
          moved++
        } else if (a.type === 'missing') {
          const choice = missingChoices[a.bookId]
          if (choice === 'keep') return
          batch.update(doc(booksCol, a.bookId), {
            status: choice === 'sold' ? 'sold' : 'unplaced',
            shelfId: null,
            row: null,
            updatedAt: serverTimestamp(),
          })
          removed++
        }
      })

      await batch.commit()

      // 写真を保存(失敗しても本の更新は反映済みなので警告のみ)
      try {
        const photoId = `${shelf.id}_${row}_${Date.now()}`
        const path = `hondoko/photos/${photoId}.jpg`
        await uploadString(storageRef(storage, path), base64Ref.current, 'base64', {
          contentType: 'image/jpeg',
        })
        await addDoc(collection(db, 'hondoko-photos'), {
          shelfId: shelf.id,
          row,
          storagePath: path,
          bookCount: kept + added + moved,
          addedCount: added,
          removedCount: removed,
          movedCount: moved,
          by: auth.currentUser?.email ?? '',
          createdAt: serverTimestamp(),
        })
      } catch (e) {
        console.warn('photo save failed:', e)
      }

      setSummary(`反映しました: 追加 ${added}冊 / 移動 ${moved}冊 / 撤去 ${removed}冊 / 既存 ${kept}冊`)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '反映に失敗しました')
      setStep('review')
    }
  }

  const toggle = (i: number) => setEnabled((prev) => prev.map((v, j) => (j === i ? !v : v)))

  const counts = {
    add: actions.filter((a, i) => a.type === 'add' && enabled[i]).length,
    move: actions.filter((a, i) => a.type === 'move' && enabled[i]).length,
    missing: actions.filter((a, i) => a.type === 'missing' && enabled[i] && missingChoices[(a as { bookId: string }).bookId] !== 'keep').length,
  }

  return (
    <Modal title={`${shelf.name} ${row}段目 — 写真で更新`} onClose={onClose} wide>
      {step === 'pick' && (
        <div className="text-center py-6 space-y-4">
          <p className="text-sm text-stone-600 whitespace-pre-line">
            この段のクローズアップ写真を撮影またはアップロードしてください。{'\n'}
            背表紙の文字が読める距離・明るさで、1段ずつがおすすめです。
          </p>
          {booksInRow.length > 0 && (
            <p className="text-xs text-stone-400">
              現在この段には {booksInRow.length} 冊登録されています。写真と比較して差分を提案します。
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button className={btnPrimary + ' inline-flex items-center gap-2'} onClick={() => fileInput.current?.click()}>
            <Camera size={18} /> 写真を選ぶ / 撮る
          </button>
        </div>
      )}

      {step === 'analyzing' && (
        <Spinner label={'AIが背表紙を読み取っています…\n(30秒〜2分ほどかかります)'} />
      )}

      {step === 'applying' && <Spinner label="反映しています…" />}

      {step === 'review' && (
        <div className="space-y-3">
          {note && <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">AIメモ: {note}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-stone-600">
            チェックした項目だけ反映されます。
            <span className="font-medium text-stone-800">
              (追加 {counts.add} / 移動 {counts.move} / 見当たらない {counts.missing})
            </span>
          </p>
          <ul className="space-y-1.5 max-h-[45dvh] overflow-y-auto pr-1">
            {actions.map((a, i) => (
              <li
                key={i}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  !enabled[i] ? 'opacity-40 border-stone-200' :
                  a.type === 'add' ? 'border-green-200 bg-green-50' :
                  a.type === 'move' ? 'border-blue-200 bg-blue-50' :
                  a.type === 'missing' ? 'border-red-200 bg-red-50' :
                  'border-stone-200 bg-white'
                }`}
              >
                <input type="checkbox" className="mt-1" checked={enabled[i]} onChange={() => toggle(i)} />
                <div className="min-w-0 flex-1">
                  {a.type === 'keep' && (
                    <>
                      <span className="text-xs font-bold text-stone-400">既存</span>
                      <p className="text-stone-700 truncate">{a.detected.title}{a.detected.volume ? ` (${a.detected.volume})` : ''}</p>
                    </>
                  )}
                  {a.type === 'add' && (
                    <>
                      <span className="text-xs font-bold text-green-700">追加</span>
                      <p className="text-stone-800 font-medium">{a.detected.title}{a.detected.volume ? ` (${a.detected.volume})` : ''}</p>
                      <p className="text-xs text-stone-500">
                        {a.detected.author || '著者不明'}
                        {a.detected.tags.length > 0 && ' — ' + a.detected.tags.map((t) => `#${t}`).join(' ')}
                        {a.detected.confidence === 'low' && <span className="text-orange-600 ml-1">(読み取り自信低)</span>}
                      </p>
                    </>
                  )}
                  {a.type === 'move' && (
                    <>
                      <span className="text-xs font-bold text-blue-700">移動 ({a.fromLabel} → ここ)</span>
                      <p className="text-stone-800 font-medium">{a.detected.title}{a.detected.volume ? ` (${a.detected.volume})` : ''}</p>
                    </>
                  )}
                  {a.type === 'missing' && (() => {
                    const b = booksInRow.find((x) => x.id === a.bookId)
                    return (
                      <>
                        <span className="text-xs font-bold text-red-700">写真に見当たらない</span>
                        <p className="text-stone-800 font-medium">{b?.title}{b?.volume ? ` (${b.volume})` : ''}</p>
                        <select
                          className={inputCls + ' !w-auto mt-1 !py-1 text-xs'}
                          value={missingChoices[a.bookId]}
                          onChange={(e) =>
                            setMissingChoices((prev) => ({ ...prev, [a.bookId]: e.target.value as MissingChoice }))
                          }
                        >
                          <option value="unplaced">未配置にする(どこかへ移動した)</option>
                          <option value="sold">売却済みにする</option>
                          <option value="keep">そのまま残す(写り込まなかっただけ)</option>
                        </select>
                      </>
                    )
                  })()}
                </div>
              </li>
            ))}
            {actions.length === 0 && (
              <li className="text-center text-sm text-stone-400 py-6">本が検出されませんでした</li>
            )}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <button className={btnSecondary} onClick={() => setStep('pick')}>撮り直す</button>
            <button className={btnPrimary} onClick={apply} disabled={actions.length === 0}>反映する</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-8 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-green-100 text-green-700 flex items-center justify-center">
            <Check size={26} />
          </div>
          <p className="text-sm text-stone-700">{summary}</p>
          <button className={btnPrimary} onClick={onClose}>閉じる</button>
        </div>
      )}
    </Modal>
  )
}
