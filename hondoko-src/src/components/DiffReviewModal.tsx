import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Check, Wand2 } from 'lucide-react'
import { auth, db } from '../firebase'
import type { Book, DiffAction, Shelf } from '../types'
import type { AnalysisJob } from '../hooks/useAnalysisJobs'
import { computeDiff, shelfCode } from '../lib/diff'
import { getPhotoUrl } from '../lib/photoUrl'
import { Modal, Spinner, btnPrimary, btnSecondary, inputCls } from './ui'

type MissingChoice = 'unplaced' | 'sold' | 'keep'
type Assignment = { shelfId: string; row: number } | null

// 「1-3」形式のラベルから棚と段を引く
function parseRegionLabel(label: string, shelves: Shelf[]): Assignment {
  const m = /^(.+)-(\d+)$/.exec(label.trim())
  if (!m) return null
  const shelf = shelves.find((s) => shelfCode(s) === m[1])
  const row = parseInt(m[2], 10)
  if (!shelf || !row || row > shelf.rows) return null
  return { shelfId: shelf.id, row }
}

// バックグラウンド解析の結果(複数段対応)を確認して一括反映するモーダル
export function DiffReviewModal({
  job,
  shelves,
  books,
  onClose,
  onApplied,
}: {
  job: AnalysisJob
  shelves: Shelf[]
  books: Book[]
  onClose: () => void
  onApplied: () => void
}) {
  const rows = useMemo(() => job.result?.rows ?? [], [job.result])
  // 開いた時点のデータで差分を確定させる
  const [booksSnapshot] = useState(books)

  // 解析に使った写真(確認しながら反映できるように上部に表示)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoExpanded, setPhotoExpanded] = useState(false)
  useEffect(() => {
    if (!job.storagePath) return
    let ok = true
    getPhotoUrl(job.storagePath).then((u) => ok && setPhotoUrl(u)).catch(() => {})
    return () => { ok = false }
  }, [job.storagePath])

  // セクション(段)単位の反映オン/オフ
  const [sectionEnabled, setSectionEnabled] = useState<boolean[]>(() => rows.map(() => true))

  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    rows.map((r, i) => {
      if (job.target) {
        const shelf = shelves.find((s) => s.id === job.target!.shelfId)
        const row = job.target!.row + i
        return shelf && row <= shelf.rows ? { shelfId: shelf.id, row } : null
      }
      return parseRegionLabel(r.region, shelves)
    }),
  )
  const autoMatched = useMemo(
    () => rows.map((r) => !job.target && !!parseRegionLabel(r.region, shelves)),
    [rows, job.target, shelves],
  )

  // セクションごとの差分(先のセクションで一致した本は後のセクションの照合から除外)
  const sections = useMemo(() => {
    const used = new Set<string>()
    return rows.map((row, i) => {
      const a = assignments[i]
      if (!a) return { actions: [] as DiffAction[], booksInRow: [] as Book[] }
      const booksInRow = booksSnapshot
        .filter((b) => b.status === 'owned' && b.shelfId === a.shelfId && b.row === a.row && !used.has(b.id))
        .sort((x, y) => x.position - y.position)
      const avail = booksSnapshot.filter((b) => !used.has(b.id))
      const actions = computeDiff(row.books, booksInRow, avail, shelves)
      for (const act of actions) {
        if (act.type === 'keep' || act.type === 'move') used.add(act.bookId)
      }
      return { actions, booksInRow }
    })
  }, [rows, assignments, booksSnapshot, shelves])

  // チェック状態(既定: 有効)と「見当たらない本」の扱い(既定: 未配置)
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set())
  const [missingChoices, setMissingChoices] = useState<Record<string, MissingChoice>>({})
  const [step, setStep] = useState<'review' | 'applying' | 'done'>('review')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  const actKey = (si: number, ai: number) => `${si}:${ai}`
  const isEnabled = (si: number, ai: number) => !disabledSet.has(actKey(si, ai))
  const toggle = (si: number, ai: number) =>
    setDisabledSet((prev) => {
      const next = new Set(prev)
      const k = actKey(si, ai)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const setAssignment = (i: number, a: Assignment) => {
    setAssignments((prev) => prev.map((x, j) => (j === i ? a : x)))
    setDisabledSet(new Set()) // 割り当て変更で差分が変わるためチェックをリセット
  }

  const apply = async () => {
    // 同じ場所への二重割り当てを防ぐ(反映対象のセクションのみ)
    const seen = new Set<string>()
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i]
      if (!a || !sectionEnabled[i]) continue
      const k = `${a.shelfId}:${a.row}`
      if (seen.has(k)) { setError('同じ段に複数の写真セクションが割り当てられています'); return }
      seen.add(k)
    }
    if (!assignments.some((a, i) => a && sectionEnabled[i])) { setError('反映する段がありません'); return }

    setStep('applying')
    try {
      const batch = writeBatch(db)
      const booksCol = collection(db, 'hondoko-books')
      let added = 0, moved = 0, removed = 0, kept = 0
      const photoDocs: { shelfId: string; row: number; count: number; add: number; rm: number; mv: number }[] = []

      sections.forEach((sec, si) => {
        const a = assignments[si]
        if (!a || !sectionEnabled[si]) return
        let sAdd = 0, sRm = 0, sMv = 0, sKeep = 0
        sec.actions.forEach((act, ai) => {
          if (!isEnabled(si, ai)) return
          if (act.type === 'keep') {
            const existing = sec.booksInRow.find((b) => b.id === act.bookId)
            batch.update(doc(booksCol, act.bookId), {
              position: act.position,
              ...(existing && existing.tags.length === 0 && act.detected.tags.length > 0
                ? { tags: act.detected.tags }
                : {}),
              updatedAt: serverTimestamp(),
            })
            sKeep++
          } else if (act.type === 'add') {
            batch.set(doc(booksCol), {
              title: act.detected.title,
              author: act.detected.author,
              publisher: act.detected.publisher,
              volume: act.detected.volume,
              isbn: '',
              kind: act.detected.kind,
              tags: act.detected.tags,
              memo: '',
              status: 'owned',
              shelfId: a.shelfId,
              row: a.row,
              position: act.position,
              confidence: act.detected.confidence,
              source: 'photo',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
            sAdd++
          } else if (act.type === 'move') {
            batch.update(doc(booksCol, act.bookId), {
              status: 'owned',
              shelfId: a.shelfId,
              row: a.row,
              position: act.position,
              updatedAt: serverTimestamp(),
            })
            sMv++
          } else if (act.type === 'missing') {
            const choice = missingChoices[act.bookId] ?? 'unplaced'
            if (choice === 'keep') return
            batch.update(doc(booksCol, act.bookId), {
              status: choice === 'sold' ? 'sold' : 'unplaced',
              shelfId: null,
              row: null,
              updatedAt: serverTimestamp(),
            })
            sRm++
          }
        })
        added += sAdd; moved += sMv; removed += sRm; kept += sKeep
        photoDocs.push({ shelfId: a.shelfId, row: a.row, count: sKeep + sAdd + sMv, add: sAdd, rm: sRm, mv: sMv })
      })

      await batch.commit()

      if (job.storagePath) {
        for (const p of photoDocs) {
          try {
            await addDoc(collection(db, 'hondoko-photos'), {
              shelfId: p.shelfId,
              row: p.row,
              storagePath: job.storagePath,
              bookCount: p.count,
              addedCount: p.add,
              removedCount: p.rm,
              movedCount: p.mv,
              by: auth.currentUser?.email ?? '',
              createdAt: serverTimestamp(),
            })
          } catch (e) {
            console.warn('photo doc save failed:', e)
          }
        }
      }

      setSummary(`反映しました: 追加 ${added}冊 / 移動 ${moved}冊 / 撤去 ${removed}冊 / 既存 ${kept}冊`)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '反映に失敗しました')
      setStep('review')
    }
  }

  const title = job.target
    ? (() => {
        const s = shelves.find((x) => x.id === job.target!.shelfId)
        return s ? `${shelfCode(s)}-${job.target!.row}（${s.name}）— 解析結果の確認` : '解析結果の確認'
      })()
    : '解析結果の確認(自動判別)'

  return (
    <Modal title={title} onClose={onClose} wide>
      {step === 'applying' && <Spinner label="反映しています…" />}

      {step === 'review' && (
        <div className="space-y-4">
          {photoUrl && (
            <button className="w-full block" onClick={() => setPhotoExpanded(!photoExpanded)} title="タップで拡大/縮小">
              <img
                src={photoUrl}
                alt="解析した写真"
                className={`w-full ${photoExpanded ? 'max-h-[60dvh] object-contain' : 'max-h-40 object-cover'} rounded-xl border border-stone-200 transition-all`}
              />
              <span className="block text-[10px] text-stone-400 mt-0.5">解析した写真(タップで{photoExpanded ? '縮小' : '拡大'})</span>
            </button>
          )}
          {job.result?.note && (
            <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">AIメモ: {job.result.note}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {rows.length > 1 && (
            <p className="text-sm text-stone-600">
              写真から <b>{rows.length}つの段</b> を検出しました。それぞれの割り当て先を確認してください。
            </p>
          )}

          {rows.map((row, si) => {
            const a = assignments[si]
            const shelf = a ? shelves.find((s) => s.id === a.shelfId) : null
            const sec = sections[si]
            return (
              <div key={si} className={`border rounded-xl overflow-hidden ${sectionEnabled[si] ? 'border-stone-200' : 'border-stone-200 opacity-50'}`}>
                <div className="bg-stone-50 px-3 py-2 flex flex-wrap items-center gap-2 border-b border-stone-200">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sectionEnabled[si]}
                      onChange={(e) =>
                        setSectionEnabled((prev) => prev.map((v, j) => (j === si ? e.target.checked : v)))
                      }
                    />
                    写真内の段{rows.length > 1 ? ` ${si + 1}(上から)` : ''}
                    <span className="font-normal text-stone-400">{row.books.length}冊検出</span>
                  </label>
                  {!sectionEnabled[si] && <span className="text-[11px] text-stone-400">この段は反映されません</span>}
                  {autoMatched[si] && (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                      <Wand2 size={11} /> 自動判別
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <select
                      className={inputCls + ' !w-auto !py-1 text-xs'}
                      value={a?.shelfId ?? ''}
                      onChange={(e) => {
                        const sid = e.target.value
                        setAssignment(si, sid ? { shelfId: sid, row: 1 } : null)
                      }}
                    >
                      <option value="">割り当てない</option>
                      {shelves.map((s) => (
                        <option key={s.id} value={s.id}>{shelfCode(s)}: {s.name}</option>
                      ))}
                    </select>
                    <select
                      className={inputCls + ' !w-auto !py-1 text-xs'}
                      value={a?.row ?? 1}
                      disabled={!a}
                      onChange={(e) => a && setAssignment(si, { shelfId: a.shelfId, row: Number(e.target.value) })}
                    >
                      {Array.from({ length: shelf?.rows ?? 1 }, (_, r) => r + 1).map((r) => (
                        <option key={r} value={r}>{r}段目</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!a ? (
                  <p className="px-3 py-3 text-xs text-stone-400">割り当て先を選ぶと差分が表示されます(このセクションは反映されません)</p>
                ) : (
                  <ul className="space-y-1.5 max-h-[32dvh] overflow-y-auto p-2">
                    {sec.actions.map((act, ai) => (
                      <li
                        key={ai}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                          !isEnabled(si, ai) ? 'opacity-40 border-stone-200' :
                          act.type === 'add' ? 'border-green-200 bg-green-50' :
                          act.type === 'move' ? 'border-blue-200 bg-blue-50' :
                          act.type === 'missing' ? 'border-red-200 bg-red-50' :
                          'border-stone-200 bg-white'
                        }`}
                      >
                        <input type="checkbox" className="mt-1" checked={isEnabled(si, ai)} onChange={() => toggle(si, ai)} />
                        <div className="min-w-0 flex-1">
                          {act.type === 'keep' && (
                            <>
                              <span className="text-xs font-bold text-stone-400">既存</span>
                              <p className="text-stone-700 truncate">{act.detected.title}{act.detected.volume ? ` (${act.detected.volume})` : ''}</p>
                            </>
                          )}
                          {act.type === 'add' && (
                            <>
                              <span className="text-xs font-bold text-green-700">追加</span>
                              <p className="text-stone-800 font-medium">{act.detected.title}{act.detected.volume ? ` (${act.detected.volume})` : ''}</p>
                              <p className="text-xs text-stone-500">
                                {act.detected.author || '著者不明'}
                                {act.detected.tags.length > 0 && ' — ' + act.detected.tags.map((t) => `#${t}`).join(' ')}
                                {act.detected.confidence === 'low' && <span className="text-orange-600 ml-1">(読み取り自信低)</span>}
                              </p>
                            </>
                          )}
                          {act.type === 'move' && (
                            <>
                              <span className="text-xs font-bold text-blue-700">移動 ({act.fromLabel} → ここ)</span>
                              <p className="text-stone-800 font-medium">{act.detected.title}{act.detected.volume ? ` (${act.detected.volume})` : ''}</p>
                            </>
                          )}
                          {act.type === 'missing' && (() => {
                            const b = sec.booksInRow.find((x) => x.id === act.bookId)
                            return (
                              <>
                                <span className="text-xs font-bold text-red-700">写真に見当たらない</span>
                                <p className="text-stone-800 font-medium">{b?.title}{b?.volume ? ` (${b.volume})` : ''}</p>
                                <select
                                  className={inputCls + ' !w-auto mt-1 !py-1 text-xs'}
                                  value={missingChoices[act.bookId] ?? 'unplaced'}
                                  onChange={(e) =>
                                    setMissingChoices((prev) => ({ ...prev, [act.bookId]: e.target.value as MissingChoice }))
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
                    {sec.actions.length === 0 && (
                      <li className="text-center text-xs text-stone-400 py-4">本が検出されませんでした</li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}

          <div className="flex justify-end gap-2 pt-1">
            <button className={btnSecondary} onClick={onClose}>あとで確認</button>
            <button className={btnPrimary} onClick={apply} disabled={rows.length === 0}>反映する</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-8 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-green-100 text-green-700 flex items-center justify-center">
            <Check size={26} />
          </div>
          <p className="text-sm text-stone-700">{summary}</p>
          <button className={btnPrimary} onClick={onApplied}>閉じる</button>
        </div>
      )}
    </Modal>
  )
}
