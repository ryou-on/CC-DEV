import { fileKind, droppedFiles, textLines } from './imports.js';
import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { APP, RELEASE_NOTES, TYPES } from './meta';
import PhotoEditor, { Avatar } from './PhotoEditor';
import { readPhotos, writePhoto, writePhotos } from './photos';
import WordCloud from './WordCloud';
import { DEMO } from './demo';
import { selectRecordings, summarize, totals, time, timelineGroups } from './metrics';
import { request, API_BASE, cloud, watchUser, login, logout, MESSAGES } from './api';
const COLORS = ['#24786a', '#d39b4e', '#6a8fbc', '#9d86b1', '#75a484'];
function Modal({ title, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const origin = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current.showModal();
    return () => { document.body.style.overflow = overflow; origin?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close(); } }}>
    <div className="sticky top-0 z-10 bg-white py-2 flex items-center justify-between gap-4 mb-6"><h2 id="modal-title" className="text-xl font-bold">{title}</h2><button className="btn" onClick={close}>閉じる</button></div>{children}
  </dialog>;
}
function App() {
  const [attachments, setAttachments] = useState([]), [importing, setImporting] = useState(false), [photoFile, setPhotoFile] = useState(null), [textPreview, setTextPreview] = useState(null);
  const folderInput = useRef(null);
  const [analysisMode, setAnalysisMode] = useState('volume');
  const [demo, setDemo] = useState(true), [records, setRecords] = useState([]), [queue, setQueue] = useState([]), [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null), [notice, setNotice] = useState(''), [fallback, setFallback] = useState('');
  const [day, setDay] = useState('all'), [room, setRoom] = useState('all'), [speaker, setSpeaker] = useState('all'), [axis, setAxis] = useState('speaker');
  const [type, setType] = useState('all'), [review, setReview] = useState(false), [selected, setSelected] = useState(null), [user, setUser] = useState(null);
  const [health, setHealth] = useState(null), [feedback, setFeedback] = useState(''), [feedbackBusy, setFeedbackBusy] = useState(false);
  const [photoState, setPhotoState] = useState({ namespace: '', data: {} }), [photoPerson, setPhotoPerson] = useState('');
  const photoNamespace = demo ? 'demo' : cloud ? (user?.uid ? `user-${user.uid}` : 'signed-out') : 'local';
  const photos = photoState.namespace === photoNamespace ? photoState.data : {};
  useEffect(() => { setPhotoState({ namespace: photoNamespace, data: readPhotos(photoNamespace) }); }, [photoNamespace]);
  useEffect(() => {
    if (cloud) return;
    let active = true;
    request('/demo-photos').then(({ photos: seed }) => {
      const key = 'speech-dashboard.demo-photos-seeded.v1';
      if (!active || localStorage.getItem(key) || !Object.keys(seed || {}).length) return;
      const existing = readPhotos('demo');
      const rows = Object.entries(seed).filter(([name]) => !Object.hasOwn(existing, name)).map(([name, photo]) => ({ name, photo }));
      const data = writePhotos('demo', existing, rows); localStorage.setItem(key, '1');
      setPhotoState(current => current.namespace === 'demo' ? { namespace: 'demo', data } : current);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const photoFor = name => Object.hasOwn(photos, name) ? photos[name] : null;
  const openPhotos = (name = '') => { setPhotoFile(null); setPhotoPerson(name); setModal('photos'); };
  const savePhoto = (name, image) => setPhotoState({ namespace: photoNamespace, data: writePhoto(photoNamespace, readPhotos(photoNamespace), name, image) });
  const saveManyPhotos = rows => setPhotoState({ namespace: photoNamespace, data: writePhotos(photoNamespace, readPhotos(photoNamespace), rows) });
  const feedbackStart = useRef(0), diagnostics = useRef([]), input = useRef(null);
  const addLog = code => { diagnostics.current = [...diagnostics.current.slice(-29), { at: new Date().toISOString(), code: /^[A-Z_]{1,40}$/.test(code) ? code : 'UNKNOWN_ERROR' }]; };
  const fail = error => { addLog(error.message); setNotice(MESSAGES[error.message] || '処理できませんでした。診断情報をコピーできます。'); };
  const resetFilters = () => { setDay('all'); setRoom('all'); setSpeaker('all'); setSelected(null); setType('all'); setReview(false); };
  const load = async () => { try { const data = await request('/recordings'); setRecords(data.recordings); } catch (e) { fail(e); } };
  useEffect(() => watchUser(value => { setUser(value); setRecords([]); setSelected(null); }), []);
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/speech/health`).then(r => r.json()).then(data => { if (active) setHealth(data); }).catch(() => { if (active) setHealth(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!demo && !busy && (!cloud || user)) { load(); request('/analytics', { method: 'POST' }).catch(() => {}); } }, [demo, user, busy]);
  const all = demo ? DEMO : records;
  const scope = selectRecordings(all, { day, room }), filtered = scope.filter(r => speaker === 'all' || r.speaker === speaker);
  // Personal filtering never changes the denominator of the speaking share.
  const comparison = summarize(scope, axis), peopleRows = summarize(scope, 'speaker'), kpi = totals(filtered);
  const importedUtterances = attachments.filter(r=>r.kind==='text').flatMap(r=>r.lines.map((text,i)=>({recordingId:r.id,id:`text-${i}`,text,speaker:r.file.name,day:'参考テキスト',room:'未割当',session:'参考資料',start:0})));
  const utterances = filtered.flatMap(r => r.utterances.map(u => ({ ...u, recordingId: r.id, speaker: r.speaker, day: r.day, room: r.room, session: r.session, analysisMode: r.analysisMode })))
    .filter(u => (type === 'all' || (u.analysis?.type || (u.analysisMode === 'volume' ? '対象外' : '未分析')) === type) && (!review || (u.analysisMode !== 'volume' && (!u.analysis || u.analysis.review))));
  const unique = key => [...new Set(all.map(r => r[key]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  async function addFiles(files) {
    setImporting(true); const audio=[],other=[];
    try {
      for(const file of Array.from(files)) {
        const kind=fileKind(file), limit=kind==='audio'?512:kind==='image'?20:5;
        const row={id:crypto.randomUUID(),file,kind,name:file.webkitRelativePath || file.name};
        if(!file.size || file.size>limit*1024*1024 || kind==='unsupported') {other.push({...row,kind:'unsupported',reason:!file.size?'空ファイル':kind==='unsupported'?'未対応形式':`${limit}MB上限を超過`});continue;}
        if(kind==='audio') audio.push({id:row.id,file,speaker:file.name.replace(/\.[^.]+$/, '').slice(0,80),day:'Day 1',session:'全体会',kind:'Main',room:'Main',start:'0',end:'',offset:'0',status:'待機'});
        else if(kind==='text') {try {const body=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());other.push({...row,body,lines:textLines(body,file.name)});}catch {other.push({...row,kind:'unsupported',reason:'UTF-8のテキストとして読み込めません'});}}
        else other.push(row);
      }
      setQueue(previous=>[...previous,...audio]);setAttachments(previous=>[...previous,...other]);
      setNotice(`${audio.length+other.length}件を確認：音声${audio.length}件、画像${other.filter(r=>r.kind==='image').length}件、テキスト${other.filter(r=>r.kind==='text').length}件、要確認${other.filter(r=>r.kind==='unsupported').length}件。`);
    } finally {setImporting(false);}
  }
  async function onDropFiles(event) {
    event.preventDefault(); if(busy || importing)return;
    try {const pending=droppedFiles(event.dataTransfer);setImporting(true);await addFiles(await pending);}catch {setImporting(false);setNotice('フォルダをすべて読み込めませんでした。「フォルダを選択」で再選択してください。');}
  }
  function edit(id, key, value) { setQueue(q => q.map(r => r.id === id ? { ...r, [key]: value, ...(key === 'kind' ? { room: value === 'Main' ? 'Main' : 'Room A' } : {}) } : r)); }
  async function analyze() {
    if (busy || importing || !queue.length) return;
    setBusy(true); setDemo(false); resetFilters(); setNotice('区間を順番に分析しています。完了まで画面を開いたままお待ちください。');
    const outcome = { complete: 0, partial: 0, failed: 0 }; let stopped = false;
    for (const row of queue.filter(q => q.status !== '保存済み')) {
      edit(row.id, 'error', '');
      edit(row.id, 'status', '分析中');
      try {
        const { file, id, status, error, ...metadata } = row;
        const form = new FormData(); form.set('file', file); form.set('metadata', JSON.stringify({ ...metadata, analysisMode }));
        let result = await request(cloud ? '/recordings' : '/recordings?background=1', { method: 'POST', body: form });
        if(result.jobId) {
          const jobId=result.jobId;
          while(true) {
            await new Promise(resolve=>setTimeout(resolve,1500));
            const job=await request(`/jobs/${jobId}`);
            if(job.status==='failed')throw new Error(job.result?.code || 'PROCESSING_FAILED');
            if(job.status==='complete'){result=job.result;break;}
            edit(row.id,'error',job.phase);
          }
        }
        edit(row.id,'error','');
        setRecords(previous => [...previous.filter(r => r.id !== result.recording.id), result.recording]);
        edit(row.id, 'status', result.recording.status === 'partial' ? '部分完了' : '保存済み');
        outcome[result.recording.status === 'partial' ? 'partial' : 'complete']++;
        if (result.recording.status === 'partial') edit(row.id, 'error', '発話量は保存済みですが、文字起こし・内容分析に未完了があります。API設定や接続を確認してください。');
        addLog(result.duplicate ? 'DUPLICATE_SKIPPED' : 'SAVED');
      } catch (e) {
        outcome.failed++; edit(row.id, 'status', '失敗'); edit(row.id, 'error', MESSAGES[e.message] || '処理に失敗しました。診断情報をコピーしてください。'); addLog(e.message);
        if (['RATE_LIMIT', 'BUSY', 'SERVER_UNAVAILABLE', 'AUTH_REQUIRED'].includes(e.message)) { stopped = true; break; }
      }
    }
    setBusy(false); setNotice(`今回の結果：完了 ${outcome.complete}件・部分完了 ${outcome.partial}件・失敗 ${outcome.failed}件。${stopped ? '後続の処理を中断しました。' : ''}${outcome.failed ? '各ファイルの失敗理由をご確認ください。' : outcome.partial ? '発話量を保存しました。未完了の分析は各行をご確認ください。' : '分析結果を保存しました。'}`);
  }
  async function copyDebug() {
    const data = JSON.stringify({ appId: APP.id, version: APP.version, at: new Date().toISOString(), page: location.origin + location.pathname, screen: 'dashboard', mode: demo ? 'demo' : 'recordings', browser: /Firefox/.test(navigator.userAgent) ? 'Firefox' : /Chrome/.test(navigator.userAgent) ? 'Chromium' : 'Safari/Other', counts: { recordings: records.length, queued: queue.length }, logs: diagnostics.current }, null, 2);
    try { await navigator.clipboard.writeText(data); setNotice('診断情報をコピーしました。氏名・録音名・発言本文は含みません。'); }
    catch { setFallback(data); setModal('debug'); }
  }
  async function submitFeedback(e) {
    e.preventDefault(); setFeedbackBusy(true);
    try { await request('/feedback', { method: 'POST', body: JSON.stringify({ message: feedback, appId: APP.id, version: APP.version, url: APP.url, startedAt: feedbackStart.current, website: '' }) }); setFeedback(''); setModal(null); setNotice(cloud ? 'ご意見を受け付けました。' : 'ご意見をローカルに保存しました。'); }
    catch (error) { fail(error); } finally { setFeedbackBusy(false); }
  }
  return <div className="min-h-screen">
    <header className="bg-[#132c2c] text-white px-5 md:px-10 py-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4"><div aria-hidden="true" className="flex gap-1 items-end h-7">{[12, 23, 16, 28, 10].map((h, i) => <span key={i} style={{ height: h }} className="w-1.5 rounded bg-[#b3d1a4]" />)}</div><button onClick={() => setModal('manual')} className="font-bold text-xl">{APP.name}</button><button onClick={() => setModal('release')} className="text-xs text-[#d4bb85]">v{APP.version}</button></div>
      <nav className="flex flex-wrap gap-5 items-center text-xs text-[#ccdad4]"><button onClick={() => openPhotos()}>顔写真</button><button onClick={() => { feedbackStart.current = Date.now(); setModal('feedback'); }}>目安箱</button><button onClick={copyDebug}>コンソールをコピー</button>{cloud && <button disabled={busy} onClick={() => (user ? logout() : login()).catch(fail)}>{user ? 'ログアウト' : 'ログイン'}</button>}</nav>
    </header>
    <main className="max-w-[1400px] mx-auto px-5 md:px-10 py-9">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7"><div><p className="text-xs tracking-[.2em] text-[#718679] mb-3">SPEECH INSIGHTS / PHASE 1</p><h1 className="text-3xl font-bold tracking-tight">対話のかたちを、見える化。</h1><p className="text-sm text-[#6c7f75] mt-3">誰が、いつ、どのように話したか。研修の対話を振り返る。</p></div><div className="flex gap-2"><button className={`btn ${demo ? 'primary' : ''}`} disabled={busy} onClick={() => { setDemo(true); resetFilters(); }}>サンプル</button><button className={`btn ${!demo ? 'primary' : ''}`} disabled={busy} onClick={() => { setDemo(false); resetFilters(); }}>実録音</button></div></div>
      {notice && <div role="status" className="mb-5 rounded-lg border border-[#d2ded5] bg-[#eaf1eb] px-4 py-3 text-sm flex justify-between gap-4"><span>{notice}</span><button aria-label="通知を閉じる" onClick={() => setNotice('')}>×</button></div>}
      <div className="mb-6 flex flex-wrap gap-3 items-center text-xs"><span className="pill">{demo ? 'DEMO · 32人 / A〜D各8人 / 1日3回のワーク' : cloud ? 'Firebase保存' : 'ローカル保存'}</span><span className="text-[#6e7e73]">発話時間は推定値です。{demo ? '発言・数値・IDは架空です。写真の人物の実績ではありません。' : analysisMode === 'full' ? '次の分析では音声をOpenAI、発言本文をJevへ送信します。' : '次の分析は外部AIへの送信なしで発話量を計測します。'}</span></div>
      <fieldset disabled={busy} className="card p-5 mb-6" aria-label="分析プラン"><legend className="font-bold">分析プランを選択</legend><div className="grid md:grid-cols-2 gap-4">{[['volume','発話量のみ','低コスト · 外部AI API料金なし','発話時間・発話率・回数・平均発話長・タイムラインを比較します。'],['full','文字起こし＋内容分析','詳細分析 · 外部AI API料金あり','発話量に加え、文字起こし・発言タイプ・主体性・質問判定・ワードクラウドを利用できます。']].map(([value,title,price,description])=><label key={value} className={`block border rounded-xl p-4 cursor-pointer ${analysisMode===value?'border-[#24786a] bg-[#edf4ed]':'border-[#dce5dc]'}`}><span className="flex items-center gap-2 font-bold"><input type="radio" aria-label={title} name="analysisMode" value={value} checked={analysisMode===value} onChange={()=>{setAnalysisMode(value);setQueue(q=>q.map(r=>({...r,status:'待機',error:''})));}}/>{title}</span><span className="block text-xs my-2 text-[#496b59]">{price}</span><span className="block text-sm leading-6">{description}</span></label>)}</div><p className="text-xs mt-3 text-[#6c7f75]">次に取り込む録音へ適用します。保存済み結果やサンプルは切り替えだけでは変更しません。発話時間は両プランとも同じ無音検出方式です。詳細分析は内容まで確認できるプランで、計測精度やAI判定の正しさを保証するものではありません。</p>{analysisMode==='full' && <p className="text-sm mt-3">OpenAI・Jevの設定が必要です。送信音声の合計時間・分析量に応じて費用が発生します。</p>}</fieldset>
      <details className="card mb-7" open={!demo || queue.length > 0}>
        <summary className="cursor-pointer p-5 font-bold text-sm">録音を取り込む <span className="font-normal text-[#849187] ml-3">参加者ごとの音声 → 区間を分類 → 分析</span></summary>
        <div className="px-5 pb-5">
          <div onDragOver={e => e.preventDefault()} onDrop={onDropFiles} className="border-2 border-dashed border-[#c3d2c6] rounded-xl p-7 text-center bg-[#f8faf7]">
            <p className="font-medium mb-2">音声・テキスト・スクショ・フォルダをドラッグ＆ドロップ</p><p className="text-xs text-[#7c8e80] mb-4">音声：512MB・12時間まで / 画像：PNG・JPEG・WebP 20MBまで / テキスト：TXT・MD・CSV・TSV・JSON・SRT・VTT（UTF-8）5MBまで</p><button className="btn" disabled={busy || importing} onClick={() => input.current.click()}>ファイルを選択</button><input ref={input} type="file" className="hidden" multiple accept=".m4a,.wav,.mp3,.mp4,.webm,.ogg,.flac,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.tsv,.json,.srt,.vtt" onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }} /><button className="btn ml-3" disabled={busy || importing} onClick={()=>folderInput.current.click()}>フォルダを選択</button><input ref={folderInput} aria-label="取り込みフォルダ" type="file" className="hidden" multiple webkitdirectory="" onChange={e=>{addFiles(Array.from(e.target.files));e.target.value='';}}/><p className="text-xs mt-3">{importing?'フォルダ内を読み込み中…':`音声 ${queue.length}件 / 画像・テキスト等 ${attachments.length}件`}</p>
          </div>
          <p className="text-xs text-[#6d7f72] mt-3">終了秒が空欄なら録音の末尾まで分析します。詳細分析は5分単位で自動分割します。 Mainの重複録音は代表1本を選んでください。同一参加者には全日を通して同じ参加者IDを使います。API未設定時も発話量を算出し、内容は未分析として保存します。</p>
          {!!attachments.length && <section className="my-4 space-y-2" aria-label="画像・テキスト・未対応ファイル"><p className="text-xs">画像は顔写真登録、テキストは確認・語の集計に使います。音声との自動同期・本人照合は行いません。参考資料は発話時間に加算しません。資料と選択ファイルは再読込で消えます。</p>{attachments.map(row=><div key={row.id} className="border rounded p-3 flex flex-wrap gap-3 items-center"><span className="break-all">{row.name}</span><span className="pill">{row.kind==='image'?'スクショ・画像':row.kind==='text'?'参考テキスト':'要確認'}</span>{row.reason && <span className="text-xs">{row.reason}</span>}{row.kind==='image' && <button className="btn" onClick={()=>{setPhotoFile(row.file);setPhotoPerson('');setModal('photos');}}>顔写真を読み取る</button>}{row.kind==='text' && <button className="btn" onClick={()=>{setTextPreview(row);setModal('text');}}>テキストを確認</button>}<button onClick={()=>setAttachments(prev=>prev.filter(r=>r.id!==row.id))}>取り込みから外す</button></div>)}</section>}
          {!!queue.length && <div className="space-y-3 mt-5">{queue.map(row => <div key={row.id} className="rounded-lg border border-[#dde5df] p-4">
            <div className="flex justify-between gap-3 text-xs mb-4"><p className="break-all">{row.file.name} <span className="pill ml-2">{row.status}</span></p><div className="flex gap-3 shrink-0"><button disabled={busy} onClick={() => setQueue(q => [...q, { ...row, id: crypto.randomUUID(), status: '待機' }])}>区間を追加</button><button disabled={busy} onClick={() => setQueue(q => q.filter(r => r.id !== row.id))}>削除</button></div></div>
            {row.error && <p role="status" className="text-sm text-amber-900 bg-amber-50 rounded p-3 mb-4">{row.error}</p>}
            <fieldset disabled={busy || row.status === '保存済み'} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <label>参加者ID<input aria-label="参加者ID" value={row.speaker} maxLength={80} onChange={e => edit(row.id, 'speaker', e.target.value)} /></label>
              <label>Day<select value={row.day} onChange={e => edit(row.id, 'day', e.target.value)}>{Array.from({ length: 30 }, (_, i) => <option key={i}>Day {i + 1}</option>)}</select></label>
              <label>セッションID<input value={row.session} maxLength={80} onChange={e => edit(row.id, 'session', e.target.value)} /></label>
              <label>Main / Room<select value={row.kind} onChange={e => edit(row.id, 'kind', e.target.value)}><option>Main</option><option>Room</option></select></label>
              <label>Room名<input disabled={row.kind === 'Main'} value={row.room} maxLength={80} onChange={e => edit(row.id, 'room', e.target.value)} /></label>
              <label>録音開始秒<input type="number" min="0" step="0.1" value={row.start} onChange={e => edit(row.id, 'start', e.target.value)} /></label>
              <label>録音終了秒<input type="number" min="0" step="0.1" placeholder="末尾" value={row.end} onChange={e => edit(row.id, 'end', e.target.value)} /></label>
              <label>時刻補正秒<input type="number" step="0.1" value={row.offset} onChange={e => edit(row.id, 'offset', e.target.value)} /></label>
            </fieldset>
          </div>)}</div>}
          <div className="flex flex-wrap justify-between gap-3 items-center mt-4"><p className="text-xs text-[#738276]">{health ? `接続済み · 文字起こし ${health.providers.openai ? '設定済み' : '未設定'} / Jev ${health.providers.jev ? '設定済み' : '未設定'}` : 'ローカルサーバーの起動が必要です。READMEをご確認ください。'}</p><button className="btn primary" disabled={busy || importing || !queue.some(r => r.status !== '保存済み') || (cloud && !user)} onClick={analyze}>{busy ? '分析中…' : '分析して保存'}</button></div>
        </div>
      </details>
      <section className="flex flex-wrap gap-4 mb-6" aria-label="絞り込み">
        <label className="min-w-32">対象日<select aria-label="対象日" value={day} onChange={e => { setDay(e.target.value); setSelected(null); }}><option value="all">すべての日</option>{unique('day').map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="min-w-36">対象ルーム<select aria-label="対象ルーム" value={room} onChange={e => { setRoom(e.target.value); setSelected(null); }}><option value="all">Main + 全ルーム</option>{unique('room').map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="min-w-36">参加者<select aria-label="参加者フィルタ" value={speaker} onChange={e => { setSpeaker(e.target.value); setSelected(null); }}><option value="all">全参加者</option>{unique('speaker').map(v => <option key={v}>{v}</option>)}</select></label>
        <p className="self-end text-xs text-[#839086] pb-3 md:ml-auto">発話率の分母：選択した日・ルームの全員の発話時間</p>
      </section>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7" aria-label="発話量サマリー">
        {[['総発話時間', time(kpi.seconds), '分:秒 / 推定'], ['参加者', kpi.people, '取り込み済み'], ['発言回数', kpi.count, '連続した発話区間'], ['平均発話長', `${kpi.average.toFixed(1)}秒`, '無音部分を除く']].map(([name, value, note], i) => <div className={`card p-5 md:p-6 ${i === 0 ? '!bg-[#e4eddf] !border-[#d3e0cd]' : ''}`} key={name}><p className="text-xs text-[#677f6c] mb-3">{name}</p><p className="text-3xl md:text-4xl font-semibold tracking-tight tabular-nums">{value}</p><p className="text-[11px] text-[#82917f] mt-3">{note}</p></div>)}
      </section>
      {!filtered.length && <div className="card p-10 text-center mb-7"><p className="font-bold">表示する録音がありません</p><p className="text-sm text-[#7b8c80] mt-3">録音を取り込むか、フィルタを変更してください。</p>{!demo && <button className="btn mt-4" onClick={load}>保存済みデータを再読込</button>}</div>}
      <section className="grid lg:grid-cols-2 gap-6 mb-7">
        <div className="card p-5 md:p-6"><div className="flex flex-wrap gap-3 justify-between items-center mb-7"><h2 className="font-bold">発話時間の比較</h2><div className="flex gap-1">{[['speaker', '個人別'], ['room', 'ルーム別'], ['day', '日別']].map(([key, label]) => <button key={key} className={`btn ${axis === key ? 'primary' : ''}`} onClick={() => setAxis(key)}>{label}</button>)}</div></div>
          <div className="h-64 min-w-0" role="img" aria-label={`${axis === 'day' ? '日別' : axis === 'room' ? 'ルーム別' : '個人別'}発話時間グラフ`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={comparison} margin={{ left: -15, right: 10 }}><CartesianGrid vertical={false} stroke="#e9eeea" /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v)}秒`}/><Tooltip formatter={v => [time(v), '発話時間']} /><Bar dataKey="seconds" isAnimationActive={false} radius={[5, 5, 0, 0]} maxBarSize={48}>{comparison.map((r, i) => <Cell key={r.name} fill={COLORS[i % COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>
          </div><p className="text-xs text-[#839086] mt-4">日・ルームの選択を反映。比較グラフは全参加者を表示します。</p>
        </div>
        <div className="card overflow-hidden"><div className="p-6 flex justify-between items-center"><h2 className="font-bold">参加者ごとの発話量</h2><span className="pill">推定値</span></div><div className="overflow-x-auto max-h-80"><table className="w-full"><thead><tr><th>参加者</th><th>発話時間</th><th>発話率</th><th>回数</th><th>平均</th></tr></thead><tbody>{peopleRows.filter(r => speaker === 'all' || r.name === speaker).map((r, i) => <tr key={r.name}><td><button className="flex items-center gap-2" aria-label={`${r.name}の写真を設定`} onClick={() => openPhotos(r.name)}><Avatar name={r.name} photo={photoFor(r.name)} /><span>{r.name}</span></button></td><td>{time(r.seconds)}</td><td>{r.share.toFixed(1)}%</td><td>{r.count}</td><td>{r.average.toFixed(1)}秒</td></tr>)}</tbody></table></div></div>
      </section>
      {!!importedUtterances.length && <details className="card p-5 mb-7"><summary>参考テキストのワードクラウド（音声とは別集計）</summary><WordCloud utterances={importedUtterances}/></details>}
      {!demo && filtered.length > 0 && filtered.every(r => r.analysisMode === 'volume') ? <section className="card p-6 mb-7"><h2 className="font-bold">発言内容まで振り返りたい方へ</h2><p className="text-sm mt-3">発話量のみで分析済みです。文字起こし・ワードクラウド・発言分類は詳細分析で利用できます。</p><button className="btn mt-4" disabled={busy} onClick={()=>{setAnalysisMode('full');setQueue(q=>q.map(r=>({...r,status:'待機',error:''})));}}>文字起こし＋内容分析を選ぶ</button><p className="text-xs mt-2">同じ音声と区間を再選択し「分析して保存」を押すと追加分析します。選ぶだけでは課金処理を開始しません。</p></section> : <WordCloud utterances={utterances} />}
      <section className="card p-5 md:p-6 mb-7"><div className="flex flex-wrap justify-between gap-3 mb-6"><h2 className="font-bold">発話タイムライン</h2><p className="text-xs text-[#7d8d80]">区間をクリックすると発言を表示 · セッションごとの時刻</p></div>
        <div className="max-h-[440px] overflow-y-auto space-y-7">{timelineGroups(filtered).map(group => {
          const max = Math.max(1, ...group.recordings.flatMap(r => r.utterances.map(u => u.end)));
          return <div key={group.key}><p className="text-xs text-[#4d7660] mb-3">{group.label}</p><div className="ml-24 flex justify-between text-[10px] text-[#849789] mb-2">{[0, .25, .5, .75, 1].map(t => <span key={t}>{time(max * t)}</span>)}</div>{group.recordings.map((r, i) => <div key={r.id} className="flex items-center gap-2 py-2"><span className="w-22 shrink-0 flex items-center gap-1 text-xs"><Avatar name={r.speaker} photo={photoFor(r.speaker)} small /><span className="truncate">{r.speaker}</span></span><div className="timeline-row relative h-6 grow rounded bg-[#f6f8f5]">{r.utterances.map(u => <button key={u.id} title={`${r.speaker} ${time(u.start)}–${time(u.end)}`} aria-label={`${r.speaker} ${time(u.start)}の発言`} onClick={() => setSelected({ ...u, speaker: r.speaker, day: r.day, room: r.room, session: r.session, analysisMode: r.analysisMode })} style={{ left: `${u.start / max * 100}%`, width: `${Math.max(.4, (u.end - u.start) / max * 100)}%`, background: COLORS[i % COLORS.length] }} className="absolute h-5 top-0.5 rounded-sm hover:opacity-70" />)}</div></div>)}</div>;
        })}</div>
        {selected && <div className="mt-5 rounded-lg bg-[#f0f5ee] p-4 text-sm"><p className="text-xs text-[#68816c] mb-2">{selected.day} / {selected.session} / {selected.room} · {selected.speaker} · {time(selected.start)}–{time(selected.end)}</p><p>{selected.text || (selected.analysisMode === 'volume' ? '発話量のみ（文字起こし対象外）' : '文字起こし未取得')}</p><p className="text-xs mt-3">{selected.analysis?.type || (selected.analysisMode === 'volume' ? '対象外' : '未分析')} · 主体性 {selected.analysis ? selected.analysis.score.toFixed(1) : '—'} / 4</p></div>}
      </section>
      <section className="card overflow-hidden"><div className="p-5 md:p-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold">発話内容を振り返る</h2><p className="text-xs text-[#7d8d80] mt-2">分類・主体性・質問判定はAIによる推定。人物の能力を評価するものではありません。</p></div><div className="flex gap-3 items-center"><select aria-label="発言タイプ" value={type} onChange={e => setType(e.target.value)}><option value="all">全タイプ</option>{[...TYPES, '未分析', '対象外'].map(t => <option key={t}>{t}</option>)}</select><label className="whitespace-nowrap flex items-center gap-2"><input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} />要確認のみ</label></div></div>
        <div className="max-h-[480px] overflow-auto"><table className="w-full"><thead><tr><th>日 / ルーム</th><th>参加者 / 時刻</th><th>発言</th><th>タイプ</th><th>主体性</th><th>質問判定</th><th>確認</th></tr></thead><tbody>{utterances.map(u => <tr key={`${u.recordingId}-${u.id}`}><td>{u.day}<br/><span className="text-xs text-[#819286]">{u.room}</span></td><td><span className="flex items-center gap-2"><Avatar name={u.speaker} photo={photoFor(u.speaker)} small /><span>{u.speaker}<br/><span className="text-xs text-[#819286]">{time(u.start)}</span></span></span></td><td className="!whitespace-normal min-w-64 max-w-lg">{u.text || (u.analysisMode === 'volume' ? '発話量のみ（文字起こし対象外）' : '文字起こし未取得')}</td><td><span className="pill">{u.analysis?.type || (u.analysisMode === 'volume' ? '対象外' : '未分析')}</span></td><td>{u.analysis ? `${u.analysis.score.toFixed(1)} / 4` : '—'}</td><td>{u.analysis ? `${u.analysis.questionProbability >= .5 ? 'はい' : 'いいえ'} (${Math.round(u.analysis.questionProbability * 100)}%)` : '—'}</td><td>{u.analysisMode === 'volume' ? '対象外' : !u.analysis || u.analysis.review ? '要確認' : '—'}</td></tr>)}</tbody></table>{!utterances.length && <p className="p-8 text-center text-sm text-[#7d8d80]">該当する発言はありません。</p>}</div>
      </section>
      <footer className="py-7 text-[11px] text-[#8b998d] flex flex-wrap justify-between gap-3"><span>SPEECH INSIGHTS · KIKAKU7 · v{APP.version}</span><span>{demo ? '架空データによるプレビュー' : `${records.length}件の録音区間`} / Phase 1</span></footer>
    </main>
    {modal === 'text' && <Modal title="参考テキスト" close={()=>setModal(null)}><p className="text-xs mb-4">音声との時刻・話者対応は未設定です。</p><pre className="whitespace-pre-wrap break-all text-sm max-h-96 overflow-auto">{textPreview?.body}</pre></Modal>}
    {modal === 'photos' && <Modal title="参加者の顔写真" close={() => setModal(null)}><PhotoEditor key={photoNamespace} namespace={photoNamespace} initialFile={photoFile} initialPerson={photoPerson} people={[...new Set([...Object.keys(photos), ...all.map(r => r.speaker), ...(!demo ? queue.map(r => r.speaker.trim()).filter(Boolean) : [])])].sort()} photos={photos} save={savePhoto} saveMany={saveManyPhotos} /></Modal>}
    {modal === 'manual' && <Modal title="発話分析の使い方" close={() => setModal(null)}><div className="space-y-4 text-sm leading-7"><p>参加者ごとのZoom録音から、発話量と発言内容を振り返るアプリです。</p><ol className="list-decimal pl-5"><li>分析プランを選びます。発話量のみは外部AI料金なし、詳細分析は文字起こしと内容分析のAPI料金が発生します。切り替えだけでは処理を開始しません。</li><li>「録音を取り込む」で参加者別の音声を選びます。</li><li>参加者ID、Day、Main/Room、セッションと区間を設定します。</li><li>録音の開始時刻がずれている場合は時刻補正秒を入力します。録音100秒をセッション0秒に合わせる例は −100 です。</li><li>「分析して保存」で発話量・文字起こし・分類を取得します。</li><li>フィルタと比較軸を切り替え、タイムラインから発言を確認します。</li><li>ワードクラウドは頻出語を大きく表示します。単語を押すと元の発言を確認でき、不要な語は除外欄で隠せます。ワードクラウドのライト／ダークを切り替えられ、色は歯科・医療・研修／整理法・一般語を表します。単語選択後に分類を修正できます。</li><li>「顔写真」でZoom画面のスクショを読み込むか、対応ブラウザではZoom画面を選んで取得します。「参加者枠と名前を一括読み取り」で候補を作り、名前の誤読を修正し、不要な枠を外して確認後に一括登録します。個別の切り抜き位置も調整できます。</li></ol><p>発話率は選択範囲の全員の発話時間に占める割合です。雑音や無音検出の誤差を含む推定値のため、録音内容と照合してください。サンプル表示は架空データです。</p><p>録音はOpenAI、発言本文はJevに送信されます。参加者の了承と利用目的を確認してから取り込んでください。音声は処理終了後に一時領域から削除されます。</p><p>顔写真は切り抜きだけをこのブラウザへ保存します。サンプルと実録音は別管理です。名前欄だけを自分のサーバーへ送りOCRで読み取ります。元のスクショは保存せず、顔写真はAPIや診断コピーに含めません。「顔写真」から削除できます。端末間の同期は未対応です。</p><a className="btn inline-block" href={APP.home}>ホームへ戻る</a></div></Modal>}
    {modal === 'release' && <Modal title="リリースノート" close={() => setModal(null)}>{RELEASE_NOTES.map(r => <article key={r.version}><p className="font-bold">v{r.version} <span className="text-xs font-normal text-[#879589] ml-3">{r.date}</span></p><ul className="text-sm list-disc pl-5 space-y-2 mt-4">{r.changes.map(c => <li key={c}>{c}</li>)}</ul><p className="text-xs mt-5 text-[#819080]">Phase 1：ローカルでは512MB・12時間まで対応。自動同期・異なる録音機間の重複統合は今後の対応です。</p></article>)}</Modal>}
    {modal === 'feedback' && <Modal title="目安箱" close={() => setModal(null)}><form onSubmit={submitFeedback}><p className="text-sm mb-4">氏名、メールアドレス、電話番号、住所、アカウント情報などの個人情報や機密情報は入力しないでください。</p><label>ご意見・不具合<textarea required maxLength={2000} rows={5} value={feedback} onChange={e => setFeedback(e.target.value)} /></label><button className="btn primary mt-4" disabled={feedbackBusy}>{feedbackBusy ? '送信中…' : cloud ? '送信' : 'ローカルに保存'}</button>{notice && <p role="status" className="text-sm mt-3">{notice}</p>}</form></Modal>}
    {modal === 'debug' && <Modal title="診断情報をコピー" close={() => setModal(null)}><p className="text-sm mb-4">自動コピーできませんでした。以下を選択してコピーしてください。</p><textarea aria-label="診断情報" readOnly rows={12} value={fallback} onFocus={e => e.target.select()} /></Modal>}
  </div>;
}
export default App;
