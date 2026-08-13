import { useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { db, OWNER_EMAIL } from '../firebase'
import type { Book, Shelf, ShelfGroup, SharingConfig, SharingMode } from '../types'
import { APP_VERSION } from '../version'
import { changeShelfRows, MAX_ROWS } from '../lib/shelfOps'
import { lookupBookInfo } from '../lib/api'
import { btnSecondary, inputCls } from './ui'

const genKey = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)

const MODE_LABEL: Record<SharingMode, { label: string; desc: string }> = {
  private: { label: 'メンバーのみ', desc: '家族メンバーだけが閲覧・編集できます(標準)' },
  viewers: { label: '特定の人のみ', desc: '下のリストに追加したGoogleアカウントが閲覧できます(編集不可)' },
  link: { label: 'リンクを知っている人', desc: '共有リンクを知っている人がGoogleログイン後に閲覧できます' },
  public: { label: '公開', desc: 'URLを知っていれば誰でも(Googleログイン後に)閲覧できます' },
}

export function SettingsView({
  shelves,
  books,
  members,
  userEmail,
  sharing,
}: {
  shelves: Shelf[]
  books: Book[]
  members: string[]
  userEmail: string
  sharing: SharingConfig | null
}) {
  const isOwner = userEmail === OWNER_EMAIL
  const [newMember, setNewMember] = useState('')
  const [newViewer, setNewViewer] = useState('')
  const [busy, setBusy] = useState(false)

  const share: SharingConfig = sharing ?? { mode: 'private', viewers: [], allowComments: false, linkKey: genKey() }

  const saveSharing = async (patch: Partial<SharingConfig>) => {
    await setDoc(doc(db, 'hondoko-config', 'sharing'), { ...share, ...patch }, { merge: false })
  }

  const shareUrl = `${location.origin}/hondoko/` + (share.mode === 'link' ? `?k=${share.linkKey}` : '')

  const addShelf = async () => {
    const name = prompt('棚の名前(例: IKEA-7)')
    if (!name) return
    await addDoc(collection(db, 'hondoko-shelves'), {
      name,
      code: String(shelves.length + 1),
      group: 'サブ' as ShelfGroup,
      rows: 6,
      order: shelves.length,
      createdAt: serverTimestamp(),
    })
  }

  const updateShelf = async (shelf: Shelf, patch: Partial<Shelf>) => {
    await updateDoc(doc(db, 'hondoko-shelves', shelf.id), patch)
  }

  const removeShelf = async (shelf: Shelf) => {
    const count = books.filter((b) => b.shelfId === shelf.id && b.status === 'owned').length
    if (count > 0) {
      alert(`${shelf.name} には ${count} 冊登録されています。先に本を移動・整理してください`)
      return
    }
    if (!confirm(`棚「${shelf.name}」を削除しますか？`)) return
    await deleteDoc(doc(db, 'hondoko-shelves', shelf.id))
  }

  const saveMembers = async (emails: string[]) => {
    setBusy(true)
    await setDoc(doc(db, 'hondoko-config', 'members'), { emails }, { merge: false })
    setBusy(false)
  }

  const inStock = books.filter((b) => b.status !== 'sold')
  const listTotal = inStock.reduce((s, b) => s + (b.listPrice ?? 0), 0)
  const listCount = inStock.filter((b) => b.listPrice != null).length
  // 購入合計: 手入力を優先し、未入力の本は定価で補完
  const purchaseTotal = inStock.reduce((s, b) => s + (b.purchasePrice ?? b.listPrice ?? 0), 0)
  const purchaseCount = inStock.filter((b) => b.purchasePrice != null || b.listPrice != null).length
  const resaleTotal = inStock.reduce((s, b) => s + (b.resalePrice ?? 0), 0)
  const resaleCount = inStock.filter((b) => b.resalePrice != null).length

  // 定価・書影の一括自動取得(未取得の本のみ)
  const [bulk, setBulk] = useState<{ done: number; total: number; price: number; cover: number } | null>(null)
  const bulkFetchPrices = async () => {
    // 未取得(undefined)に加え、過去に見つからなかった本(coverUrl==='' / listPrice===null)も再試行する
    const targets = books.filter(
      (b) => b.title && (b.listPrice == null || b.coverUrl === undefined || b.coverUrl === '' || b.pubDate === undefined),
    )
    if (targets.length === 0) { alert('未取得の本はありません'); return }
    // 1回の実行上限(Google Books のレート制限対策)
    const LIMIT = 120
    const run = targets.slice(0, LIMIT)
    setBulk({ done: 0, total: run.length, price: 0, cover: 0 })
    let priceHit = 0
    let coverHit = 0
    for (let i = 0; i < run.length; i++) {
      const b = run[i]
      let usedPaapi = false
      try {
        const info = await lookupBookInfo(b)
        usedPaapi = !!info.usedPaapi
        await updateDoc(doc(db, 'hondoko-books', b.id), {
          ...(b.listPrice == null ? { listPrice: info.price } : {}),
          ...(!b.coverUrl ? { coverUrl: info.coverUrl ?? '' } : {}),
          ...(b.pubDate === undefined || (!b.pubDate && info.pubDate) ? { pubDate: info.pubDate ?? '' } : {}),
          ...(info.isbn && !b.isbn ? { isbn: info.isbn } : {}),
        })
        if (b.listPrice == null && info.price != null) priceHit++
        if (!b.coverUrl && info.coverUrl) coverHit++
      } catch { /* 個別失敗はスキップ */ }
      setBulk({ done: i + 1, total: run.length, price: priceHit, cover: coverHit })
      // レート調整: PA-API利用時は1秒強、ISBNなし本(Google Books)は0.35秒待つ
      if (usedPaapi) await new Promise((r) => setTimeout(r, 1200))
      else if (!b.isbn) await new Promise((r) => setTimeout(r, 350))
    }
    setBulk(null)
    alert(`${run.length}冊を処理: 定価${priceHit}冊 / 書影${coverHit}冊を取得しました` +
      (targets.length > LIMIT ? `\n(残り${targets.length - LIMIT}冊はもう一度実行してください)` : '') +
      '\n取得できなかった書影は、本の詳細から「写真から登録」「URLで登録」で追加できます')
  }
  const stats = {
    owned: books.filter((b) => b.status === 'owned').length,
    unplaced: books.filter((b) => b.status === 'unplaced').length,
    sold: books.filter((b) => b.status === 'sold').length,
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="font-bold text-sm text-stone-700 mb-2">蔵書統計</h2>
        <div className="grid grid-cols-3 text-center">
          <div><p className="text-2xl font-bold text-amber-700">{stats.owned}</p><p className="text-xs text-stone-400">棚にある</p></div>
          <div><p className="text-2xl font-bold text-stone-500">{stats.unplaced}</p><p className="text-xs text-stone-400">未配置</p></div>
          <div><p className="text-2xl font-bold text-stone-400">{stats.sold}</p><p className="text-xs text-stone-400">売却済み</p></div>
        </div>
        <div className="grid grid-cols-3 text-center mt-3 pt-3 border-t border-stone-100">
          <div>
            <p className="text-base font-bold text-stone-700">{listTotal.toLocaleString('ja-JP')}円</p>
            <p className="text-[11px] text-stone-400">定価合計(取得済み{listCount}冊)</p>
          </div>
          <div>
            <p className="text-base font-bold text-stone-700">{purchaseTotal.toLocaleString('ja-JP')}円</p>
            <p className="text-[11px] text-stone-400">購入合計({purchaseCount}冊・未入力は定価補完)</p>
          </div>
          <div>
            <p className="text-base font-bold text-stone-700">{resaleTotal.toLocaleString('ja-JP')}円</p>
            <p className="text-[11px] text-stone-400">リセール想定({resaleCount}冊)</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className={btnSecondary + ' !py-1.5 !px-3 text-xs'} onClick={bulkFetchPrices} disabled={!!bulk}>
            {bulk
              ? `取得中… ${bulk.done}/${bulk.total}(定価${bulk.price}/書影${bulk.cover})`
              : '定価・書影を一括自動取得'}
          </button>
          <p className="text-[10px] text-stone-300">openBD/Google Booksから取得。取得できない書影は本の詳細から写真/URLで登録可</p>
        </div>
      </section>

      {isOwner && (
        <section className="bg-white rounded-xl border border-stone-200 p-4">
          <h2 className="font-bold text-sm text-stone-700 mb-2">公開設定(ゲスト閲覧)</h2>
          <div className="space-y-2">
            {(Object.keys(MODE_LABEL) as SharingMode[]).map((m) => (
              <label key={m} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sharing-mode"
                  className="mt-1"
                  checked={share.mode === m}
                  onChange={() => saveSharing({ mode: m })}
                />
                <span>
                  <span className="text-sm font-medium text-stone-800">{MODE_LABEL[m].label}</span>
                  <span className="block text-xs text-stone-400">{MODE_LABEL[m].desc}</span>
                </span>
              </label>
            ))}
          </div>

          {share.mode === 'viewers' && (
            <div className="mt-3 pl-6">
              <ul className="space-y-1 mb-2">
                {share.viewers.map((v) => (
                  <li key={v} className="text-sm text-stone-700 flex items-center gap-2">
                    {v}
                    <button className="text-stone-400 hover:text-red-600"
                      onClick={() => saveSharing({ viewers: share.viewers.filter((x) => x !== v) })}>
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
                {share.viewers.length === 0 && <li className="text-xs text-stone-400">まだ誰も追加されていません</li>}
              </ul>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="guest@gmail.com" value={newViewer}
                  onChange={(e) => setNewViewer(e.target.value)} />
                <button className={btnSecondary} disabled={!newViewer.includes('@')}
                  onClick={() => { saveSharing({ viewers: [...share.viewers, newViewer.trim()] }); setNewViewer('') }}>
                  追加
                </button>
              </div>
            </div>
          )}

          {share.mode !== 'private' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <input readOnly className={inputCls + ' text-xs !py-1.5 flex-1'} value={shareUrl} onFocus={(e) => e.target.select()} />
                <button className={btnSecondary + ' !py-1.5 !px-2.5'} title="コピー"
                  onClick={() => navigator.clipboard?.writeText(shareUrl)}>
                  <Copy size={14} />
                </button>
              </div>
              {share.mode === 'link' && (
                <button className="text-xs text-stone-400 hover:text-amber-700"
                  onClick={() => { if (confirm('リンクキーを再生成しますか？(古いリンクは無効になります)')) saveSharing({ linkKey: genKey() }) }}>
                  リンクキーを再生成
                </button>
              )}
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={share.allowComments}
                  onChange={(e) => saveSharing({ allowComments: e.target.checked })} />
                ゲストのコメント投稿を許可する
              </label>
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm text-stone-700">棚の管理 <span className="font-normal text-xs text-stone-400">(番号・名前・グループ・段数)</span></h2>
          <button className={btnSecondary + ' !py-1.5 !px-3 text-xs inline-flex items-center gap-1'} onClick={addShelf}>
            <Plus size={14} /> 棚を追加
          </button>
        </div>
        <ul className="space-y-2">
          {shelves.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                className={inputCls + ' !w-14 text-center'}
                title="棚番号(場所表記「番号-段」に使用)"
                defaultValue={s.code ?? String(s.order + 1)}
                onBlur={(e) => e.target.value !== (s.code ?? '') && updateShelf(s, { code: e.target.value.trim() })}
              />
              <input
                className={inputCls + ' !w-28'}
                defaultValue={s.name}
                onBlur={(e) => e.target.value !== s.name && updateShelf(s, { name: e.target.value })}
              />
              <select
                className={inputCls + ' !w-24'}
                value={s.group}
                onChange={(e) => updateShelf(s, { group: e.target.value as ShelfGroup })}
              >
                <option value="メイン">メイン</option>
                <option value="サブ">サブ</option>
                <option value="別室">別室</option>
              </select>
              <select
                className={inputCls + ' !w-20'}
                value={s.rows}
                onChange={async (e) => {
                  const r = await changeShelfRows(s, Number(e.target.value), books)
                  if (!r.ok && r.message) alert(r.message)
                }}
              >
                {Array.from({ length: MAX_ROWS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}段</option>
                ))}
              </select>
              <button className="ml-auto p-2 text-stone-400 hover:text-red-600" onClick={() => removeShelf(s)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {shelves.length === 0 && <p className="text-sm text-stone-400">棚がありません(マップタブから標準構成を作成できます)</p>}
        </ul>
      </section>

      <section className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="font-bold text-sm text-stone-700 mb-2">家族メンバー</h2>
        <p className="text-xs text-stone-400 mb-3">
          ここに追加されたGoogleアカウントがこのアプリを利用できます。
          {!isOwner && '(編集はオーナーのみ)'}
        </p>
        <ul className="space-y-1.5 mb-3">
          <li className="text-sm text-stone-700 flex items-center gap-2">
            {OWNER_EMAIL} <span className="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">オーナー</span>
          </li>
          {members.map((m) => (
            <li key={m} className="text-sm text-stone-700 flex items-center gap-2">
              {m}
              {isOwner && (
                <button
                  className="text-stone-400 hover:text-red-600"
                  onClick={() => saveMembers(members.filter((x) => x !== m))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="family@gmail.com"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
            />
            <button
              className={btnSecondary}
              disabled={busy || !newMember.includes('@')}
              onClick={() => { saveMembers([...members, newMember.trim()]); setNewMember('') }}
            >
              追加
            </button>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-stone-400">本ドコ？ {APP_VERSION} — cc-dev-ps7</p>
    </div>
  )
}
