import { KNOWN_TERMS } from './wordCategories.js';
const STOP = new Set('です ます でした ました する した して いる ある なる れる られる これ それ あれ この その あの こと もの ため よう そう どう どんな ところ こちら ほう 方 ので から まで など でも では そして また まず ちょっと 少し 思い 思います あり ありそう ありませ ませ ましょう ください うん はい いいえ ない なく なくて ん の は が を に へ と で も や か ね よ な だ た て し お ご さ れ せ せる the a an and or is are was were to of in on it this that for with'.split(' '));
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
export const supportsWords = !!segmenter;
export function tokens(text) {
  if (!segmenter || typeof text !== 'string') return [];
  const normalized = text.normalize('NFKC').toLowerCase();
  const result = []; let plain = '';
  const flush = () => { result.push(...[...segmenter.segment(plain)].filter(p=>p.isWordLike).map(p=>p.segment)); plain = ''; };
  for (let i=0;i<normalized.length;) {
    const term = KNOWN_TERMS.find(t => normalized.startsWith(t,i) && (!/^[a-z0-9]/.test(t) || (!/[a-z0-9]/.test(normalized[i-1] || '') && !/[a-z0-9]/.test(normalized[i+t.length] || ''))));
    if (term) { flush(); result.push(term); i += term.length; } else { plain += normalized[i++]; }
  }
  flush();
  return result.filter(w => !STOP.has(w) && !/^\p{N}+$/u.test(w) && [...w].length >= 2 && /[\p{Script=Han}\p{Script=Katakana}a-z]/u.test(w));
}
export function countWords(utterances, excluded = '') {
  const omit = new Set(excluded.normalize('NFKC').toLowerCase().split(/[\s,、]+/).filter(Boolean));
  const counts = new Map();
  for (const u of utterances) for (const word of tokens(u.text)) if (!omit.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts].map(([word, count]) => ({ word, count })).sort((a,b) => b.count-a.count || a.word.localeCompare(b.word,'ja'));
}
