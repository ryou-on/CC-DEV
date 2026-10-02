import React, { useEffect, useRef, useState } from 'react';
import { cropBounds } from './photos';
export function Avatar({ name, photo, small = false }) {
  const style = { width: small ? 24 : 32, height: small ? 24 : 32 };
  return photo ? <img src={photo} alt={`${name}の顔写真`} style={style} className="rounded-full object-cover shrink-0" /> : <span aria-hidden="true" style={style} className="inline-flex items-center justify-center rounded-full bg-[#e6ede5] text-[#698069] text-[10px] shrink-0">{Array.from(name)[0] || '人'}</span>;
}
export default function PhotoEditor({ people, photos, save, namespace, initialPerson = '' }) {
  const [person, setPerson] = useState(initialPerson || people[0] || ''), [image, setImage] = useState(null), [message, setMessage] = useState(''), [capturing, setCapturing] = useState(false);
  const [x, setX] = useState(50), [y, setY] = useState(50), [size, setSize] = useState(25), [preview, setPreview] = useState('');
  const current = useRef(null), picker = useRef(null), generation = useRef(0), streamRef = useRef(null), mounted = useRef(true);
  const stop = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; stop(); }; }, []);
  useEffect(() => { setPerson(initialPerson || people[0] || ''); }, [namespace]);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const bounds = cropBounds(image.width, image.height, x, y, size), canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 160;
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 160, 160);
    context.drawImage(current.current, bounds.x, bounds.y, bounds.side, bounds.side, 0, 0, 160, 160);
    setPreview(canvas.toDataURL('image/jpeg', .85));
  }, [image, x, y, size]);
  async function useBlob(blob) {
    const ticket = ++generation.current, url = URL.createObjectURL(blob), img = new Image();
    try {
      img.src = url; await img.decode();
      if (!mounted.current || ticket !== generation.current) return;
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 50000000) throw new Error('too large');
      // Downsize the screenshot in memory; only the final 160px crop is persisted.
      const canvas = document.createElement('canvas'), scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      current.current = canvas; setImage({ src: canvas.toDataURL('image/jpeg', .9), width: canvas.width, height: canvas.height });
      setX(50); setY(50); setSize(25); setMessage('画像の中で顔の中心をクリックし、枠の大きさを調整してください。');
    } finally { URL.revokeObjectURL(url); }
  }
  async function readFile(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { setMessage('PNG・JPEG・WebPの画像を20MB以内で選んでください。'); return; }
    try { await useBlob(file); } catch { if (mounted.current) setMessage('画像を読み込めません。別のスクリーンショットを選んでください。'); }
  }
  async function capture() {
    setCapturing(true); setMessage('共有する画面としてZoomのウィンドウを選択してください。');
    let stream, timer, video;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!mounted.current) return;
      streamRef.current = stream;
      video = document.createElement('video'); video.muted = true; video.srcObject = stream;
      await Promise.race([new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; video.play().catch(reject); }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12000); })]);
      if (!mounted.current || !video.videoWidth) return;
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob && mounted.current) await useBlob(blob);
    } catch { if (mounted.current) setMessage('画面取得がキャンセルされたか、この環境では利用できません。スクショ画像を読み込めます。'); }
    finally { clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); if (video) video.srcObject = null; streamRef.current = null; if (mounted.current) setCapturing(false); }
  }
  function update(photo) {
    try { save(person, photo); setMessage(photo ? `${person}の写真をこのブラウザに保存しました。別の参加者も同じスクショから登録できます。` : '写真を削除しました。'); }
    catch { setMessage('保存できませんでした。ブラウザの保存容量・設定をご確認ください（登録上限100人）。'); }
  }
  const bounds = image ? cropBounds(image.width, image.height, x, y, size) : null;
  return <div className="space-y-4 text-sm">
    <p>Zoomのギャラリー画面から顔を切り取り、参加者IDに紐付けます。写真はこのブラウザに保存され、音声分析APIへ送信されません。</p>
    <label>写真を設定する参加者<select value={person} onChange={e => { setPerson(e.target.value); setMessage(''); }} aria-label="写真の参加者"><option value="">参加者を選択</option>{people.map(name => <option key={name}>{name}</option>)}</select></label>
    {!people.length && <p>先に音声を取り込み、参加者IDを設定してください。</p>}
    <div className="flex flex-wrap gap-2"><button className="btn" disabled={capturing} onClick={() => picker.current.click()}>スクショ画像を読み込む</button>{!!navigator.mediaDevices?.getDisplayMedia && <button className="btn" disabled={capturing} onClick={capture}>{capturing ? '画面を取得中…' : 'Zoom画面を選んで取得'}</button>}</div>
    <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" aria-label="スクリーンショット画像" className="hidden" onChange={e => { readFile(e.target.files[0]); e.target.value = ''; }} />
    <p className="text-xs text-[#788d7b]">Macでは Shift＋⌘＋4 でも撮影できます。画像内の顔と参加者IDの対応をご確認ください。元のスクショ全体は保存しません。</p>
    {image && <>
      <div className="relative w-full overflow-hidden rounded-lg bg-[#142b2a] cursor-crosshair" onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); setX((e.clientX - rect.left) / rect.width * 100); setY((e.clientY - rect.top) / rect.height * 100); }}>
        <img src={image.src} alt="読み込んだスクリーンショット。下の位置スライダーでも範囲を調整できます。" className="block w-full" />
        <div aria-hidden="true" className="absolute border-2 border-white ring-2 ring-[#258c78] pointer-events-none" style={{ left: `${bounds.x / image.width * 100}%`, top: `${bounds.y / image.height * 100}%`, width: `${bounds.side / image.width * 100}%`, height: `${bounds.side / image.height * 100}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-3">{[['横位置', x, setX, 0, 100], ['縦位置', y, setY, 0, 100], ['枠の大きさ', size, setSize, 3, 100]].map(([name, value, set, min, max]) => <label key={name}>{name}<input type="range" aria-label={name} min={min} max={max} step=".1" value={value} onChange={e => set(Number(e.target.value))} /></label>)}</div>
      <div className="flex items-center gap-4"><img src={preview || undefined} alt="切り抜きプレビュー" width="72" height="72" className="rounded-full"/><div><p className="mb-2">{person || '参加者を選択してください'}</p><button className="btn primary" disabled={!person || !preview || capturing} onClick={() => update(preview)}>この写真を保存</button></div></div>
    </>}
    {person && Object.hasOwn(photos, person) && <div className="flex items-center gap-3 border-t border-[#dce4de] pt-4"><Avatar name={person} photo={photos[person]} /><span>登録済み</span><button className="btn ml-auto" onClick={() => update(null)}>この参加者の写真を削除</button></div>}
    <p role="status" className="text-xs text-[#41745f]">{message}</p>
  </div>;
}
