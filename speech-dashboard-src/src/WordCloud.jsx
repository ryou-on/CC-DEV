import React, { useEffect, useMemo, useRef, useState } from 'react';
import { countWords, tokens, supportsWords } from './words.js';
import { time } from './metrics';
import { CATEGORIES, categoryFor } from './wordCategories.js';
import { CLOUD_FONT, layoutWords } from './cloudLayout.js';
export default function WordCloud({ utterances }) {
  const [excluded, setExcluded] = useState(''), [selected, setSelected] = useState(''), [limit, setLimit] = useState(40);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('speech-cloud-theme') !== 'light'; } catch { return true; } }), [overrides, setOverrides] = useState({});
  const container = useRef(null), [width, setWidth] = useState(900);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, entry.contentRect.width))); observer.observe(container.current); return () => observer.disconnect(); }, []);
  const height = width < 500 ? 460 : 580;
  const words = useMemo(() => countWords(utterances, excluded), [utterances, excluded]);
  const shown = words.slice(0, limit), active = words.some(w => w.word === selected) ? selected : '';
  const matches = useMemo(() => active ? utterances.filter(u => tokens(u.text).includes(active)) : [], [utterances, active]);
  const placed = useMemo(() => { const ctx = document.createElement('canvas').getContext('2d'); return layoutWords(words.slice(0,limit),width,height,(word,size) => { ctx.font = `700 ${size}px ${CLOUD_FONT}`; return ctx.measureText(word).width; }); }, [words,limit,width,height]);
  const category = word => overrides[word] || categoryFor(word);
  return <section className="card p-5 md:p-6 mb-7" aria-label="ワードクラウド">
    <div className="flex flex-wrap justify-between gap-4 items-start"><div><h2 className="font-bold">話題のワードクラウド</h2><p className="text-xs text-[#6c7f75] mt-2">日・ルーム・参加者・発言タイプ・要確認の絞り込みを反映。文字の大きさは出現回数です。</p></div><label>表示語数<select aria-label="ワードクラウド表示語数" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[20,40,60].map(n => <option key={n} value={n}>{n}語</option>)}</select></label></div>
    <label className="block mt-4 max-w-xl">除外する語<input aria-label="除外する語" maxLength={500} placeholder="例：今回、説明（空白・読点・カンマ区切り）" value={excluded} onChange={e => setExcluded(e.target.value)} /></label>
    <p className="text-xs text-[#6c7f75] mt-3">助詞などの一般語・数字・1文字の語・ひらがなのみの語を除外した簡易集計です。同義語の統合・品詞の厳密な判定は行いません。単語を選ぶと元の発言を表示します。</p>
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4"><div className="flex flex-wrap gap-4 text-xs rounded-lg p-3" style={{background:dark?'#071f2d':'#f6f4eb',color:dark?'#e0e8d1':'#354536'}} aria-label="用語の色分け">{Object.entries(CATEGORIES).map(([id,c]) => <span key={id} className="flex items-center gap-1"><span className="inline-block rounded-full w-3 h-3" style={{background:c[dark?'dark':'light']}}/>{c.label}</span>)}</div><button className="btn" aria-label="ワードクラウドのダークモード" aria-pressed={dark} onClick={()=>setDark(v=>{try {localStorage.setItem('speech-cloud-theme',v?'light':'dark');}catch {} return !v;})}>{dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}</button></div>
    <p className="text-xs text-[#6c7f75] mt-3">色は用語辞書による仮分類です。単語を選択すると分類を修正できます（この画面内のみ）。</p>
    <div ref={container} className="relative overflow-hidden rounded-xl my-4" style={{height,background:dark?'#071f2d':'#f6f4eb',color:dark?'#e0e8d1':'#354536'}} role="group" aria-label="頻出語" data-theme={dark?'dark':'light'}>
      {placed.map(({word,count,x,y,width:w,height:h,size}) => <button key={word} aria-label={`${word}：${count}回`} aria-pressed={active===word} data-category={category(word)} onClick={()=>setSelected(active===word?'':word)} title={`${word} · ${CATEGORIES[category(word)].label} · ${count}回`} className="absolute whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1" style={{left:x,top:y,width:w,height:h,fontFamily:CLOUD_FONT,fontWeight:700,fontSize:size,lineHeight:1.22,color:CATEGORIES[category(word)][dark?'dark':'light'],outline:active===word?'2px solid currentColor':undefined}}>{word}</button>)}
      {!shown.length && <p className="text-sm text-[#6c7f75]">{!supportsWords ? 'このブラウザは単語分割に対応していません。新しいブラウザで開いてください。' : utterances.some(u => u.text?.trim()) ? '表示できる語がありません。除外語や絞り込みを見直してください。' : '文字起こしのある発言がありません。サンプルを表示するか、文字起こし後に確認してください。'}</p>}
    </div>
    <p className="text-xs text-[#6c7f75]">{utterances.filter(u=>u.text?.trim()).length}発言を集計 · {words.length}種類の語から上位{placed.length}語を表示（配置候補{shown.length}語） · ブラウザ内で集計</p>
    {active && <div className="mt-5" aria-label="単語を含む発言"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-sm">「{active}」を含む発言：{matches.length}件</h3><button className="btn" onClick={()=>setSelected('')}>単語の選択を解除</button></div><label className="block max-w-xs mt-3">「{active}」の分類<select aria-label="選択した単語の分類" value={category(active)} onChange={e=>setOverrides(v=>({...v,[active]:e.target.value}))}>{Object.entries(CATEGORIES).map(([id,c])=><option key={id} value={id}>{c.label}</option>)}</select></label><ul className="max-h-72 overflow-auto mt-3 divide-y divide-[#e4ebe3]">{matches.map(u=><li key={`${u.recordingId}-${u.id}`} className="py-3 text-sm"><p className="text-xs text-[#6c7f75] mb-1">{u.day} / {u.room} / {u.session} · {u.speaker} · {time(u.start)}</p><p>{u.text}</p></li>)}</ul></div>}
  </section>;
}
