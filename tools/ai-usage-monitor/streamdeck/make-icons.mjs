// Stream Deck プラグイン用の単色PNGアイコンを生成（依存なし）
import fs from 'node:fs'; import zlib from 'node:zlib';
const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, [r, g, b]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = new URL('./com.ccdev.aiusage.sdPlugin/icons/', import.meta.url).pathname;
const defs = { plugin: [15, 23, 42], claude: [245, 158, 11], codex: [56, 189, 248], chatgpt: [52, 211, 153] };
for (const [n, c] of Object.entries(defs)) for (const [suf, s] of [['', 72], ['@2x', 144]]) fs.writeFileSync(`${dir}${n}${suf}.png`, png(s, c));
console.log('icons generated');
