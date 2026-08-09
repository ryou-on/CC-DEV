import { useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { Plus, Trash2 } from 'lucide-react'
import { db, OWNER_EMAIL } from '../firebase'
import type { Book, Shelf, ShelfGroup } from '../types'
import { APP_VERSION } from '../version'
import { btnSecondary, inputCls } from './ui'

export function SettingsView({
  shelves,
  books,
  members,
  userEmail,
}: {
  shelves: Shelf[]
  books: Book[]
  members: string[]
  userEmail: string
}) {
  const isOwner = userEmail === OWNER_EMAIL
  const [newMember, setNewMember] = useState('')
  const [busy, setBusy] = useState(false)

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
      </section>

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
                onChange={(e) => updateShelf(s, { rows: Number(e.target.value) })}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
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
