import { useMemo, useState } from 'react'
import { GalleryHorizontalEnd, LayoutGrid, List, Search } from 'lucide-react'
import type { Book, Shelf } from '../types'
import { normalize } from '../lib/text'
import { locationLabel } from '../lib/diff'
import { FlipViewer } from './FlipViewer'
import { Tag, inputCls } from './ui'

type SortKey =
  | 'created_desc' | 'created_asc'
  | 'title' | 'author'
  | 'pub_desc' | 'pub_asc'
  | 'rating_desc' | 'location'

const SORT_LABEL: Record<SortKey, string> = {
  created_desc: '登録が新しい順',
  created_asc: '登録が古い順',
  title: 'タイトル順',
  author: '著者順',
  pub_desc: '出版が新しい順',
  pub_asc: '出版が古い順',
  rating_desc: '評価が高い順',
  location: '場所順(棚-段)',
}

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
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [coverFilter, setCoverFilter] = useState<'all' | 'with' | 'without'>('all')
  const [sort, setSort] = useState<SortKey>('created_desc')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [flipIndex, setFlipIndex] = useState<number | null>(null)

  const popularTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const b of books) for (const t of b.tags) count.set(t, (count.get(t) || 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)
  }, [books])

  const filtered = useMemo(() => {
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
    if (unreadOnly) list = list.filter((b) => b.readStatus !== 'read')
    if (coverFilter === 'with') list = list.filter((b) => !!b.coverUrl)
    if (coverFilter === 'without') list = list.filter((b) => !b.coverUrl)
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
    return list
  }, [books, query, shelfFilter, includeSold, unreadOnly, coverFilter])

  // ソート
  const sorted = useMemo(() => {
    const list = filtered.slice()
    const created = (b: Book) => b.createdAt?.toMillis() ?? 0
    const jp = (a: string, b: string) => normalize(a).localeCompare(normalize(b), 'ja')
    // 出版日: 桁を8桁に揃えて比較(欠損は常に末尾へ)
    const pub = (b: Book) => (b.pubDate ? b.pubDate.padEnd(8, '0') : '')
    const shelfOrder = new Map(shelves.map((s, i) => [s.id, i]))
    switch (sort) {
      case 'created_desc': list.sort((a, b) => created(b) - created(a)); break
      case 'created_asc': list.sort((a, b) => created(a) - created(b)); break
      case 'title': list.sort((a, b) => jp(a.title, b.title)); break
      case 'author': list.sort((a, b) => jp(a.author || '￿', b.author || '￿') || jp(a.title, b.title)); break
      case 'pub_desc': list.sort((a, b) => (pub(b) || '0').localeCompare(pub(a) || '0') || jp(a.title, b.title)); break
      case 'pub_asc':
        list.sort((a, b) => {
          const pa = pub(a); const pb = pub(b)
          if (!pa && !pb) return jp(a.title, b.title)
          if (!pa) return 1
          if (!pb) return -1
          return pa.localeCompare(pb) || jp(a.title, b.title)
        })
        break
      case 'rating_desc': list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || jp(a.title, b.title)); break
      case 'location':
        list.sort((a, b) => {
          const oa = a.status === 'owned' && a.shelfId ? (shelfOrder.get(a.shelfId) ?? 999) : 1000
          const ob = b.status === 'owned' && b.shelfId ? (shelfOrder.get(b.shelfId) ?? 999) : 1000
          return oa - ob || (a.row ?? 999) - (b.row ?? 999) || a.position - b.position
        })
        break
    }
    return list
  }, [filtered, sort, shelves])

  // 描画は300件まで(件数表示は絞り込み後の総数)
  const results = useMemo(() => sorted.slice(0, 300), [sorted])

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
        <select className={inputCls + ' !w-auto'} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} title="並び順">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>{SORT_LABEL[k]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-stone-600">
          <input type="checkbox" checked={includeSold} onChange={(e) => setIncludeSold(e.target.checked)} />
          売却済みも表示
        </label>
        <label className="flex items-center gap-1.5 text-stone-600">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          未読のみ
        </label>
        <label className="flex items-center gap-1.5 text-stone-600">
          <input
            type="checkbox"
            checked={coverFilter === 'with'}
            onChange={(e) => setCoverFilter(e.target.checked ? 'with' : 'all')}
          />
          書影あり
        </label>
        <label className="flex items-center gap-1.5 text-stone-600">
          <input
            type="checkbox"
            checked={coverFilter === 'without'}
            onChange={(e) => setCoverFilter(e.target.checked ? 'without' : 'all')}
          />
          書影なし
        </label>
        <span className="ml-auto text-stone-400">
          {filtered.length.toLocaleString('ja-JP')}冊
          {filtered.length > results.length && `(先頭${results.length}件を表示)`}
        </span>
        <div className="flex items-center rounded-lg border border-stone-300 overflow-hidden">
          <button
            className={`px-2 py-1.5 ${view === 'list' ? 'bg-amber-700 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            onClick={() => setView('list')}
            title="リスト表示"
          >
            <List size={15} />
          </button>
          <button
            className={`px-2 py-1.5 ${view === 'grid' ? 'bg-amber-700 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            onClick={() => setView('grid')}
            title="書影一覧(グリッド)"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className="px-2 py-1.5 bg-white text-stone-500 hover:bg-stone-50 border-l border-stone-300"
            onClick={() => setFlipIndex(0)}
            title="書影をパラパラめくる"
            disabled={sorted.length === 0}
          >
            <GalleryHorizontalEnd size={15} />
          </button>
        </div>
      </div>

      {view === 'grid' && (
        <div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {results.map((b, i) => (
              <button
                key={b.id}
                onClick={() => onSelectBook(b.id)}
                onDoubleClick={() => setFlipIndex(i)}
                className="relative aspect-[2/3] bg-stone-100 rounded-md overflow-hidden border border-stone-200 hover:ring-2 hover:ring-amber-400 transition-shadow"
                title={`${b.title} — ${b.author || '著者不明'}`}
              >
                {b.coverUrl ? (
                  <img src={b.coverUrl} alt={b.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center p-1.5 text-[10px] text-stone-600 text-center leading-tight bg-gradient-to-br from-stone-100 to-stone-300 font-medium">
                    {b.title}
                  </span>
                )}
                {b.status === 'sold' && (
                  <span className="absolute top-1 left-1 text-[9px] bg-stone-800/80 text-white px-1 rounded">売却</span>
                )}
                <span className="absolute bottom-0 inset-x-0 text-[9px] bg-black/55 text-amber-200 px-1 py-0.5 truncate text-left">
                  {locationLabel(b, shelves)}
                </span>
              </button>
            ))}
          </div>
          {results.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-400">該当する本がありません</p>
          )}
          {filtered.length > results.length && (
            <p className="py-3 text-center text-xs text-stone-400">
              表示は{results.length}件まで。絞り込むと残り{(filtered.length - results.length).toLocaleString('ja-JP')}冊も表示できます
            </p>
          )}
        </div>
      )}

      {view === 'list' && (
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
                <div className="text-xs text-stone-400 mt-0.5 flex flex-wrap gap-x-2 items-center">
                  <span>{b.author || '著者不明'}</span>
                  {(sort === 'pub_desc' || sort === 'pub_asc') && b.pubDate && (
                    <span className="text-stone-500">{b.pubDate.slice(0, 4)}年</span>
                  )}
                  {b.readStatus === 'read' && <span className="text-green-600">✓読了</span>}
                  {(b.rating ?? 0) > 0 && <span className="text-amber-500">{'★'.repeat(b.rating!)}</span>}
                  {b.tags.slice(0, 4).map((t) => <span key={t} className="text-amber-600">#{t}</span>)}
                </div>
              </div>
            </button>
          </li>
        ))}
        {filtered.length > results.length && (
          <li className="px-4 py-3 text-center text-xs text-stone-400 bg-stone-50">
            表示は{results.length}件まで。検索やタグ・棚フィルタで絞り込むと残り{(filtered.length - results.length).toLocaleString('ja-JP')}冊も表示できます
          </li>
        )}
        {results.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-stone-400">
            {books.length === 0 ? 'まだ本が登録されていません。「マップ」から棚写真で登録しましょう' : '該当する本がありません'}
          </li>
        )}
      </ul>
      )}

      {flipIndex != null && sorted.length > 0 && (
        <FlipViewer
          books={sorted}
          shelves={shelves}
          startIndex={flipIndex}
          onClose={() => setFlipIndex(null)}
          onSelectBook={onSelectBook}
        />
      )}
    </div>
  )
}
