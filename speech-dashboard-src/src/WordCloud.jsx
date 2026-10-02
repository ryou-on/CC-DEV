import React, { useMemo, useState } from 'react';
import { countWords, tokens, supportsWords } from './words.js';
import { time } from './metrics';
const colors = ['#17695d','#926023','#4c6e96','#775e8b','#486f46'];
export default function WordCloud({ utterances }) {
  const [excluded, setExcluded] = useState(''), [selected, setSelected] = useState(''), [limit, setLimit] = useState(40);
  const words = useMemo(() => countWords(utterances, excluded), [utterances, excluded]);
  const shown = words.slice(0, limit), active = words.some(w => w.word === selected) ? selected : '';
  const matches = useMemo(() => active ? utterances.filter(u => tokens(u.text).includes(active)) : [], [utterances, active]);
  const max = shown[0]?.count || 1, min = shown.at(-1)?.count || 1;
  return <section className="card p-5 md:p-6 mb-7" aria-label="ワードクラウド">
    <div className="flex flex-wrap justify-between gap-4 items-start"><div><h2 className="font-bold">話題のワードクラウド</h2><p className="text-xs text-[#6c7f75] mt-2">日・ルーム・参加者・発言タイプ・要確認の絞り込みを反映。文字の大きさは出現回数です。</p></div><label>表示語数<select aria-label="ワードクラウド表示語数" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[20,40,60].map(n => <option key={n} value={n}>{n}語</option>)}</select></label></div>
    <label className="block mt-4 max-w-xl">除外する語<input aria-label="除外する語" maxLength={500} placeholder="例：今回、説明（空白・読点・カンマ区切り）" value={excluded} onChange={e => setExcluded(e.target.value)} /></label>
    <p className="text-xs text-[#6c7f75] mt-3">助詞などの一般語・数字・1文字の語・ひらがなのみの語を除外した簡易集計です。同義語の統合・品詞の厳密な判定は行いません。単語を選ぶと元の発言を表示します。</p>
    <div className="flex flex-wrap justify-center items-center content-center gap-x-5 gap-y-3 min-h-56 py-8 px-2 rounded-xl bg-[#f4f7f1] my-4" role="group" aria-label="頻出語">
      {shown.map(({word,count},i) => <button key={word} aria-label={`${word}：${count}回`} aria-pressed={active === word} onClick={() => setSelected(active === word ? '' : word)} title={`${count}回`} className={`max-w-full break-all leading-tight font-semibold rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${active === word ? 'ring-2 ring-[#24786a]' : ''}`} style={{fontSize:`${max === min ? 28 : 16 + 30 * Math.sqrt((count-min)/(max-min))}px`,color:colors[i%colors.length]}}>{word}<span className="text-[10px] ml-1 font-normal">{count}</span></button>)}
      {!shown.length && <p className="text-sm text-[#6c7f75]">{!supportsWords ? 'このブラウザは単語分割に対応していません。新しいブラウザで開いてください。' : utterances.some(u => u.text?.trim()) ? '表示できる語がありません。除外語や絞り込みを見直してください。' : '文字起こしのある発言がありません。サンプルを表示するか、文字起こし後に確認してください。'}</p>}
    </div>
    <p className="text-xs text-[#6c7f75]">{utterances.filter(u=>u.text?.trim()).length}発言を集計 · {words.length}種類の語から上位{shown.length}語を表示 · ブラウザ内で集計</p>
    {active && <div className="mt-5" aria-label="単語を含む発言"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-sm">「{active}」を含む発言：{matches.length}件</h3><button className="btn" onClick={()=>setSelected('')}>単語の選択を解除</button></div><ul className="max-h-72 overflow-auto mt-3 divide-y divide-[#e4ebe3]">{matches.map(u=><li key={`${u.recordingId}-${u.id}`} className="py-3 text-sm"><p className="text-xs text-[#6c7f75] mb-1">{u.day} / {u.room} / {u.session} · {u.speaker} · {time(u.start)}</p><p>{u.text}</p></li>)}</ul></div>}
  </section>;
}
