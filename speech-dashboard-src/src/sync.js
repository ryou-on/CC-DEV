import { participantName } from './participants.js';
// Match visible labels only. Never infer identity from a face or voice.
export function personKey(value='') {
 return participantName(value).replace(/^[A-D][\s_\-:：]*(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/u,'').replace(/[\s_\-]/g,'').toLowerCase();
}
export function uniquePerson(name, people) {
 const key=personKey(name);if(!key)return null;
 const matches=[...new Set(people)].filter(p=>personKey(p)===key);
 return matches.length===1?matches[0]:null;
}
function seconds(s) {const p=s.replace(',','.').split(':').map(Number);return p.reduce((n,v)=>n*60+v,0);}
export function parseSubtitles(body='') {
 const lines=body.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n'), cues=[];
 const timing=/(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})/;
 for(let i=0;i<lines.length;i++) {
  const m=lines[i].match(timing);if(!m)continue;
  let content=[];while(i+1<lines.length && lines[i+1].trim() && !timing.test(lines[i+1])) content.push(lines[++i]);
  let text=content.join(' ').trim(),speaker='';
  const voice=text.match(/^<v(?:\.[^\s>]*)?\s+([^>]+)>/i);if(voice){speaker=voice[1];text=text.replace(voice[0],'');}
  text=text.replace(/<[^>]*>/g,'').trim();
  const label=text.match(/^([^:：]{1,80})[:：]\s*(.+)$/);if(!speaker && label){speaker=label[1].trim();text=label[2];}
  const start=seconds(m[1]),end=seconds(m[2]);
  if(text && Number.isFinite(start) && end>start && end<=86400) cues.push({start,end,text:text.slice(0,2000),speaker});
 }
 return cues;
}
export function syncCandidates(cues, fileName, records) {
 const names=[...new Set(cues.map(c=>c.speaker).filter(Boolean))];
 return records.filter(r=>names.length?names.some(n=>personKey(n)===personKey(r.speaker)):personKey(fileName)===personKey(r.sourceName || r.speaker));
}
export function attachSubtitles(record,cues,offset) {
 const assigned=new Map();let matched=0, outside=0, otherSpeaker=0;
 for(const cue of cues) {
  if(cue.speaker && personKey(cue.speaker)!==personKey(record.speaker)){otherSpeaker++;continue;}
  const start=cue.start+offset,end=cue.end+offset;
  let best=-1,overlap=0;
  record.utterances.forEach((u,i)=>{const d=Math.min(u.end,end)-Math.max(u.start,start);if(d>overlap){overlap=d;best=i;}});
  if(best<0){outside++;continue;}
  assigned.set(best,[...(assigned.get(best)||[]),cue.text]);matched++;
 }
 return {matched,outside,otherSpeaker,utterances:record.utterances.map((u,i)=>{const {syncedText,...original}=u;return assigned.has(i)?{...original,syncedText:assigned.get(i).join(' ').slice(0,10000)}:original;})};
}
