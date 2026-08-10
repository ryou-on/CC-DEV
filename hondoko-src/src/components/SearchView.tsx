import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Book, Shelf } from '../types'
import { normalize } from '../lib/text'
import { locationLabel } from '../lib/diff'
import { Tag, inputCls } from './ui'

export function SearchView({
  books,
  shelves,
  query,
  setQuery,
  onSelectBook,
}: {
  books: Book[]
  shelves: Shelf[]
  query: string
  setQuery: (q: string) => void
  onSelectBook: (id: string) => void
}) {
  const [shelfFilter, setShelfFilter] = useState('')
  const [includeSold, setIncludeSold] = useState(false)

  const popularTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const b of books) for (const t of b.tags) count.set(t, (count.get(t) || 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)
  }, [books])

  const results = useMemo(() => {
    const q = query.trim()
    // フィールド指定検索: #タグ / 著者:名前 / 出版社:名前
    let field: 'all' | 'tag' | 'author' | 'publisher' = 'all'
    let term = q
    if (q.startsWith('#')) { field = 'tag'; term = q.slice(1) }
    else {
      const m = /^(著者|author)[:：](.*)$/i.exec(q) || /^(出版社|publisher|pub)[:：](.*)$/i.exec(q)
      if (m) {
        field = /^(著者|author)$/i.test(m[1]) ? 'author' : 'publisher'
        term = m[2]
      }
    }
    const nq = normalize(term)
    let list = books
    if (!includeSold) list = list.filter((b) => b.status !== 'sold')
    if (shelfFilter) list = list.filter((b) => b.shelfId === shelfFilter)
    if (nq) {
      list = list.filter((b) => {
        switch (field) {
          case 'tag': return b.tags.some((t) => normalize(t).includes(nq))
          case 'author': return normalize(b.author).includes(nq)
          case 'publisher': return normalize(b.publisher).includes(nq)
          default:
            return (
              normalize(b.title).includes(nq) ||
              normalize(b.author).includes(nq) ||
              normalize(b.publisher).includes(nq) ||
              b.tags.some((t) => normalize(t).includes(nq)) ||
              b.isbn.includes(q)
            )
        }
      })
    }
    return list.slice(0, 300)
  }, [books, query, shelfFilter, includeSold])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          className={inputCls + ' pl-10 py-2.5'}
          placeholder="タイトル・#タグ・著者:名前・出版社:名前 で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {popularTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {popularTags.map((t) => (
            <Tag
              key={t}
              label={t}
              active={query === `#${t}`}
              onClick={() => setQuery(query === `#${t}` ? '' : `#${t}`)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-sm">
        <select className={inputCls + ' !w-auto'} value={shelfFilter} onChange={(e) => setShelfFilter(e.target.value)}>
          <option value="">すべての棚</option>
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>{s.group}: {s.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-stone-600">
          <input type="checkbox" checked={includeSold} onChange={(e) => setIncludeSold(e.target.checked)} />
          売却済みも表示
        </label>
        <span className="ml-auto text-stone-400">{results.length}冊</span>
      </div>

      <ul className="divide-y divide-stone-100 bg-white rounded-xl border border-stone-200 overflow-hidden">
        {results.map((b) => (
          <li key={b.id}>
            <button
              className="w-full text-left px-4 py-2.5 hover:bg-amber-50/50 transition-colors flex items-center gap-3"
              onClick={() => onSelectBook(b.id)}
            >
              <div className="w-8 h-11 shrink-0 rounded-sm overflow-hidden bg-stone-100 flex items-center justify-center">
                {b.coverUrl ? (
                  <img src={b.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-stone-300 text-[9px]">📕</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-medium truncate ${b.status === 'sold' ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                    {b.title}{b.volume ? ` (${b.volume})` : ''}
                  </span>
                  <span className="text-xs text-amber-700 shrink-0 font-medium">{locationLabel(b, shelves)}</span>
                </div>
                <div className="text-xs text-stone-400 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{b.author || '著者不明'}</span>
                  {b.tags.slice(0, 4).map((t) => <span key={t} className="text-amber-600">#{t}</span>)}
                </div>
              </div>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-stone-400">
            {books.length === 0 ? 'まだ本が登録されていません。「マップ」から棚写真で登録しましょう' : '該当する本がありません'}
          </li>
        )}
      </ul>
    </div>
  )
}
