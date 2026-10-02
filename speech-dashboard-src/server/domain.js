import { z } from 'zod';
export const Metadata = z.object({
  analysisMode: z.enum(['volume', 'full']).default('volume'),
  speaker: z.string().trim().min(1).max(80),
  day: z.string().regex(/^Day [1-9][0-9]?$/),
  session: z.string().trim().min(1).max(80),
  kind: z.enum(['Main', 'Room']), room: z.string().trim().min(1).max(80),
  start: z.coerce.number().finite().min(0).max(86400),
  end: z.union([z.literal(''), z.coerce.number().finite().positive().max(86400)]).default(''),
  offset: z.coerce.number().finite().min(-86400).max(86400)
}).refine(m => m.end === '' || (m.end > m.start && m.end - m.start <= 600), '区間は10分以内にしてください')
  .refine(m => m.start + m.offset >= 0, '補正後の開始時刻は0秒以上です')
  .transform(m => ({ ...m, room: m.kind === 'Main' ? 'Main' : m.room }));
export const MAX_BYTES = 20 * 1024 * 1024;
export const EXTENSIONS = new Set(['.m4a', '.mp3', '.wav', '.mp4', '.webm', '.ogg', '.flac']);
export function activeIntervals(stderr, duration) {
  const silences = [], pattern = /silence_(start|end):\s*([0-9.]+)/g;
  let start = null;
  for (const match of stderr.matchAll(pattern)) {
    const point = Math.max(0, Math.min(duration, Number(match[2])));
    if (match[1] === 'start') start = point;
    else { silences.push([start ?? 0, point]); start = null; }
  }
  if (start !== null) silences.push([start, duration]);
  let cursor = 0;
  const active = [];
  for (const [from, to] of silences) { if (from > cursor) active.push([cursor, from]); cursor = Math.max(cursor, to); }
  if (cursor < duration) active.push([cursor, duration]);
  return active.filter(([a, b]) => b - a >= 0.15);
}
export function makeUtterances(active, offset = 0, gap = 0.7) {
  const result = [];
  for (const [a, b] of active) {
    const previous = result.at(-1);
    if (previous && a + offset - previous.end <= gap) {
      previous.end = b + offset; previous.speechSeconds += b - a;
    } else result.push({ id: `u${result.length}`, start: a + offset, end: b + offset, speechSeconds: b - a, text: '', analysis: null });
  }
  return result;
}
export function assignText(utterances, segments, offset = 0) {
  for (const s of segments) {
    let best = null, overlap = 0;
    for (const u of utterances) {
      const amount = Math.min(u.end, s.end + offset) - Math.max(u.start, s.start + offset);
      if (amount > overlap) { overlap = amount; best = u; }
    }
    if (best && s.text.trim()) best.text = `${best.text} ${s.text.trim()}`.trim().slice(0, 2000);
  }
  return utterances;
}
