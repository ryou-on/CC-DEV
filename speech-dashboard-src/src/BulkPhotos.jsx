import React, { useEffect, useRef, useState } from 'react';
import { detectTiles, manualTiles, cropTile, nameStrip, makeNameSheet } from './gallery';
import { request } from './api';
export default function BulkPhotos({ canvas, people, saveMany, onAdjust }) {
  const [candidates, setCandidates] = useState([]), [loading, setLoading] = useState(false), [message, setMessage] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [grid, setGrid] = useState({ left: 5, top: 10, right: 95, bottom: 90, columns: 7, rows: 6 });
  const active = useRef(true), ticket = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; ticket.current++; }; }, []);
  function change(index, patch) { setConfirmed(false); setCandidates(previous => previous.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  async function extract(manual = false) {
    if (loading) return;
    const run = ++ticket.current; setLoading(true); setConfirmed(false); setMessage('参加者枠を検出しています…');
    try {
      const tiles = manual ? manualTiles(canvas.width, canvas.height, grid) : detectTiles(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
      if (!tiles.length) { setCandidates([]); setMessage('枠を検出できませんでした。下の「枠の並びを指定」または手動切り抜きを使ってください。'); return; }
      const rows = tiles.map((rect, index) => ({ id: index, rect, photo: cropTile(canvas, rect), labelImage: nameStrip(canvas, rect, false).toDataURL('image/png'), name: '', rawName: '', confidence: 0, selected: false }));
      setCandidates(rows); setMessage(`${tiles.length}枠の表示名を読み取り中…`);
      const form = new FormData(); form.set('file', await makeNameSheet(canvas, tiles), 'labels.png'); form.set('count', String(tiles.length));
      const result = await request('/photo-names', { method: 'POST', body: form });
      if (!active.current || run !== ticket.current) return;
      setCandidates(rows.map((row, index) => {
        const label = result.labels?.find(item => item.index === index);
        const name = typeof label?.name === 'string' ? label.name.trim().slice(0, 80) : '';
        return { ...row, name, rawName: name, confidence: Number(label?.confidence) || 0, selected: !!name };
      }));
      setMessage(`${tiles.length}枠を切り抜きました。カメラOFF・不要な枠を外し、全員の名前と写真を確認してください。`);
    } catch (e) { if (active.current && run === ticket.current) setMessage(e.message === 'BUSY' ? '別の処理中です。少し待って読み取りを再実行してください。' : e.message === 'INVALID_GRID' ? '範囲・行列数を確認してください（最大100枠）。' : '名前を読み取れませんでした。サーバー起動とOCR設定をご確認ください。枠が表示されていれば名前を入力して登録できます。'); }
    finally { if (active.current && run === ticket.current) setLoading(false); }
  }
  const chosen = candidates.filter(row => row.selected);
  const valid = chosen.length > 0 && chosen.every(row => row.name.trim()) && new Set(chosen.map(row => row.name.trim())).size === chosen.length;
  function save() {
    if (!confirmed || !valid) return;
    try { saveMany(chosen.map(row => ({ name: row.name.trim(), photo: row.photo }))); setMessage(`${chosen.length}人の顔写真を保存しました。録音の参加者IDをこの名前に合わせると、分析画面に表示されます。`); setConfirmed(false); }
    catch { setMessage('一括保存できませんでした。容量・登録人数を確認してください。写真はまとめて保存するため、途中の登録はありません。'); }
  }
  return <section className="rounded-lg border border-[#bdcfbe] bg-[#f7faf6] p-4 space-y-4" aria-label="スクショ一括登録">
    <h3 className="font-bold">全画面スクショからまとめて登録</h3>
    <p className="text-xs">名前欄だけをアプリのサーバーへ送り、日本語・英語の文字を読み取ります。外部AIへは送信しません。顔写真はブラウザ内で切り抜きます。</p>
    <button className="btn primary" disabled={loading} onClick={() => extract(false)}>{loading ? '名前を読み取り中…' : '参加者枠と名前を一括読み取り'}</button>
    <details><summary className="text-xs cursor-pointer">自動検出が合わない場合：枠の並びを指定</summary><div className="grid grid-cols-3 gap-2 my-3">{[['left','左端 %',0,99],['top','上端 %',0,99],['right','右端 %',1,100],['bottom','下端 %',1,100],['columns','列数',1,10],['rows','行数',1,10]].map(([key,label,min,max]) => <label key={key}>{label}<input type="number" min={min} max={max} step={key === 'rows' || key === 'columns' ? 1 : .1} value={grid[key]} onChange={e => setGrid(g => ({ ...g, [key]: Number(e.target.value) }))} /></label>)}</div><button className="btn" disabled={loading} onClick={() => extract(true)}>指定した枠で読み取る</button><p className="text-xs mt-2">中央寄せの最終行や空欄は、切り抜き結果から除外・調整してください。</p></details>
    <p role="status" className="text-xs text-[#376950]">{message}</p>
    {!!candidates.length && <>
      <div className="flex flex-wrap gap-3 text-xs"><span>{candidates.length}枠 / 選択 {chosen.length}人</span><button disabled={loading} onClick={() => { setCandidates(r => r.map(v => ({ ...v, selected: false }))); setConfirmed(false); }}>選択を解除</button></div>
      <datalist id="photo-existing-people">{people.map(name => <option key={name} value={name}/>)}</datalist>
      <div className="space-y-3 max-h-[420px] overflow-y-auto">{candidates.map((row, index) => <article key={row.id} className="rounded-lg border border-[#dce5dc] bg-white p-3" aria-label={`候補 ${index + 1}`}>
        <div className="flex gap-3 items-center"><label className="flex gap-1 items-center shrink-0"><input type="checkbox" aria-label={`候補 ${index + 1} を登録`} disabled={loading} checked={row.selected} onChange={e => change(index, { selected: e.target.checked })}/>{index + 1}</label><img src={row.photo} alt={`候補 ${index + 1} の切り抜き`} width="56" height="56" className="rounded-full shrink-0"/><div className="grow min-w-0"><label>登録する名前・参加者ID<input aria-label={`候補 ${index + 1} の名前`} list="photo-existing-people" disabled={loading} maxLength={80} value={row.name} onChange={e => change(index, { name: e.target.value })}/></label><p className="text-[10px] text-[#7c8d7c] mt-1">{row.rawName ? `OCR ${row.confidence}% · 全件要確認` : '名前未取得 · 入力してください'}</p></div></div>
        <img src={row.labelImage} alt={`候補 ${index + 1} の元の表示名`} className="w-full mt-2 rounded border border-[#e4eae4]"/>
        <button className="text-xs mt-2 underline" disabled={loading} onClick={() => onAdjust(row.rect, photo => change(index, { photo }))}>この枠の切り抜きを調整</button>
      </article>)}</div>
      {!valid && chosen.length > 0 && <p className="text-xs text-amber-800">選択した名前を入力し、同名の重複を解消してください。</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={loading} onChange={e => setConfirmed(e.target.checked)}/><span>選択した全員の名前と写真を確認しました。同じ参加者IDの登録済み写真は置き換わります。</span></label>
      <button className="btn primary" disabled={loading || !valid || !confirmed} onClick={save}>確認した{chosen.length}人を一括登録</button>
    </>}
  </section>;
}
