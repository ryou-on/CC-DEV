import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const exec = promisify(execFile);
export function validateSheet(buffer, count) {
  return Number.isInteger(count) && count >= 1 && count <= 100 && buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.readUInt32BE(16) === 1024 && buffer.readUInt32BE(20) === count * 128;
}
export function parseLabels(tsv, count) {
  const rows = Array.from({ length: count }, (_, index) => ({ index, words: [] }));
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const fields = line.split('\t'); if (fields[0] !== '5' || fields.length < 12) continue;
    const top = Number(fields[7]), h = Number(fields[9]), confidence = Number(fields[10]);
    const row = rows[Math.floor((top + h / 2) / 128)], text = fields.slice(11).join(' ').trim();
    if (row && text && Number.isFinite(confidence) && confidence >= 0) row.words.push({ text, confidence });
  }
  return rows.map(({ index, words }) => ({ index, name: words.map(w => w.text).join(' ').trim().slice(0, 160), confidence: words.length ? Math.round(words.reduce((n, w) => n + w.confidence, 0) / words.length) : 0 }));
}
export async function readNameSheet(file, count) {
  const local = resolve('.ocr-data');
  const directory = process.env.OCR_TESSDATA_DIR || (existsSync(local) ? local : null);
  const args = [file, 'stdout', ...(directory ? ['--tessdata-dir', directory] : []), '-l', 'jpn+eng', '--oem', '1', '--psm', '6', '-c', 'tessedit_create_tsv=1'];
  try {
    const { stdout } = await exec('tesseract', args, { timeout: 60000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: '2' } });
    return parseLabels(stdout, count);
  } catch { throw new Error('OCR_UNAVAILABLE'); }
}
