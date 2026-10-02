const paths = new WeakMap();
export const importPath = file => file.webkitRelativePath || paths.get(file) || file.name;
export function fileKind(file) {
 const ext=file.name.split('.').pop().toLowerCase();
 if(['m4a','mp3','wav','mp4','webm','ogg','flac'].includes(ext)) return 'audio';
 if(['png','jpg','jpeg','webp'].includes(ext)) return 'image';
 if(['txt','md','csv','tsv','json','srt','vtt'].includes(ext)) return 'text';
 return 'unsupported';
}
// Directory readers return batches; keep reading until the final empty batch.
export async function droppedFiles(transfer) {
 const items=Array.from(transfer.items || []),entries=items.map(i=>i.webkitGetAsEntry?.());
 if(!entries.some(Boolean)) return Array.from(transfer.files || []);
 const result=[];
 async function visit(entry, parent = '') {
  const path = [parent,entry.name].filter(Boolean).join('/');
  if(entry.isFile) {const file=await new Promise((yes,no)=>entry.file(yes,no));paths.set(file,path || entry.fullPath?.replace(/^\//,'') || file.name);result.push(file);}
  else if(entry.isDirectory) {const reader=entry.createReader();while(true){const batch=await new Promise((yes,no)=>reader.readEntries(yes,no));if(!batch.length)break;for(const child of batch)await visit(child,path);}}
 }
 for(let i=0;i<items.length;i++) {if(entries[i])await visit(entries[i]);else {const f=items[i].getAsFile?.();if(f)result.push(f);}}
 return result;
}
export function textLines(text, name) {
 const subtitle=/\.(srt|vtt)$/i.test(name);
 return text.replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s && (!subtitle || (!/^\d+$/.test(s) && !s.includes('-->') && !/^WEBVTT/.test(s))));
}

export function folderRoom(path) {
 const folders=path.replace(/\\/g,'/').split('/').filter(Boolean).slice(0,-1);
 const ignored=s=>/^(audio|audio[_ ]?record|video|recordings?|録音|音声|画像|スクショ|テキスト|day[ _-]*\d+|day[ _-]*\d+.*|\d{4}[-_.]\d{1,2}[-_.]\d{1,2})$/i.test(s);
 for(const raw of [...folders].reverse()) {
  const s=raw.normalize('NFKC').trim();
  if(/^(main(?:[ _-]?session)?|メイン(?:セッション|ルーム)?|全体会|全体)$/i.test(s))return {kind:'Main',room:'Main',folder:raw};
  const match=s.match(/^(?:(?:breakout[ _-]*)?room|ブレイクアウト(?:ルーム)?|ルーム|部屋)[ _-]*(.+)$/i) || s.match(/^([A-D])$/i);
  if(match)return {kind:'Room',room:`Room ${match[1].trim().replace(/^[a-d]$/i,v=>v.toUpperCase())}`.slice(0,80),folder:raw};
 }
 const raw=[...folders].reverse().find(s=>!ignored(s.normalize('NFKC').trim()));
 return raw?{kind:'Room',room:raw.slice(0,80),folder:raw}:{kind:'Main',room:'Main',folder:''};
}
