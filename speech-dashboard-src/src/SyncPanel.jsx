import React,{useMemo,useState} from 'react';
import {parseSubtitles,syncCandidates,attachSubtitles} from './sync.js';
import {request} from './api';
export default function SyncPanel({attachments,records,onSaved,disabled}) {
 const [source,setSource]=useState(''),[target,setTarget]=useState(''),[offset,setOffset]=useState('0'),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
 const texts=attachments.filter(a=>a.kind==='text'), file=texts.find(a=>a.id===source);
 const cues=useMemo(()=>parseSubtitles(file?.body),[file]);
 const candidates=syncCandidates(cues,file?.file.name || '',records);
 const selected=records.find(r=>r.id===(target || (candidates.length===1?candidates[0].id:'')));
 const preview=selected && Number.isFinite(Number(offset))?attachSubtitles(selected,cues,Number(offset)):null;
 const reset=()=>{setConfirmed(false);setMessage('');};
 async function save(clear=false){
  if(!selected || (!clear && (!confirmed || !preview?.matched)))return;
  setSaving(true);try {const result=await request(`/recordings/${selected.id}/sync`,{method:'POST',body:JSON.stringify(clear?{clear:true}:{text:file.body,offset:Number(offset),sourceName:file.file.name})});onSaved(result.recording);setConfirmed(false);setMessage(clear?'字幕同期を解除しました。':'字幕を同期して保存しました。発話時間は変更していません。');}catch{setMessage('同期できませんでした。対象録音・字幕形式・サーバー接続を確認してください。');}finally{setSaving(false);}
 }
 return <section className="card p-5 mb-6" aria-label="資料の自動照合"><h2 className="font-bold">資料の自動照合・字幕同期</h2><p className="text-xs mt-2">字幕の話者名・音声ファイル名から候補を探します。同名や複数日など複数候補は自動確定しません。先に音声を分析してください。</p><fieldset disabled={disabled || saving} className="mt-4 space-y-3"><label className="block">字幕ファイル<select aria-label="同期する字幕" value={source} onChange={e=>{setSource(e.target.value);setTarget('');reset();}}><option value="">選択してください</option>{texts.map(a=><option key={a.id} value={a.id}>{a.file.name}</option>)}</select></label><p className="text-xs">{file?`${cues.length}字幕区間 / 照合候補 ${candidates.length}件`:'SRT・VTTの時刻と表示名を利用します。時刻なしテキストは自動同期できません。'}</p><label className="block">同期先の音声<select aria-label="同期先の音声" value={selected?.id || ''} onChange={e=>{setTarget(e.target.value);reset();}}><option value="">候補を確認して選択</option>{records.map(r=><option key={r.id} value={r.id}>{candidates.some(c=>c.id===r.id)?'候補：':''}{r.speaker} / {r.day} / {r.room} / {r.session} / {r.start}–{r.end}秒</option>)}</select></label><label className="block">字幕の時刻補正（秒）<input aria-label="字幕の時刻補正" type="number" min="-86400" max="86400" value={offset} onChange={e=>{setOffset(e.target.value);reset();}}/></label><p className="text-xs">音声の表示時刻 = 字幕時刻 + 補正秒。同じ録画開始なら0、字幕0秒が音声60秒なら60。開始が違う録画同士の時差は自動推定しません。</p>{preview && <p role="status">対応 {preview.matched}件 / 発話区間外 {preview.outside}件 / 別話者 {preview.otherSpeaker}件</p>}<label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>同じセッション・参加者・時間基準であることを確認しました</label><button className="btn primary" disabled={!confirmed || !preview?.matched || !file || Math.abs(Number(offset))>86400} onClick={()=>save()}>確認した字幕を同期</button>{selected?.syncedSource && <button className="btn ml-2" onClick={()=>save(true)}>字幕同期を解除</button>}</fieldset><p role="status" className="text-sm mt-3">{message}</p></section>;
}
