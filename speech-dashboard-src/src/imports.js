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
 async function visit(entry) {
  if(entry.isFile) {const file=await new Promise((yes,no)=>entry.file(yes,no));result.push(file);}
  else if(entry.isDirectory) {const reader=entry.createReader();while(true){const batch=await new Promise((yes,no)=>reader.readEntries(yes,no));if(!batch.length)break;for(const child of batch)await visit(child);}}
 }
 for(let i=0;i<items.length;i++) {if(entries[i])await visit(entries[i]);else {const f=items[i].getAsFile?.();if(f)result.push(f);}}
 return result;
}
export function textLines(text, name) {
 const subtitle=/\.(srt|vtt)$/i.test(name);
 return text.replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s && (!subtitle || (!/^\d+$/.test(s) && !s.includes('-->') && !/^WEBVTT/.test(s))));
}
