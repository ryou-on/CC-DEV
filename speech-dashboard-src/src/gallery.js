// Layout segmentation uses only light/dark gaps; it does not identify people.
function runs(values, threshold, minimum) {
  const result = []; let start = -1;
  for (let i = 0; i <= values.length; i++) {
    if (i < values.length && values[i] >= threshold) { if (start < 0) start = i; }
    else if (start >= 0) { if (i - start >= minimum) result.push([start, i]); start = -1; }
  }
  return result;
}
export function detectTiles({ data, width, height }) {
  const lit = (x, y) => Math.max(data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]) > 28;
  const rows = Array(height).fill(0);
  for (let y = 0; y < height; y++) for (let x = Math.floor(width * .04); x < width * .96; x += 2) if (lit(x, y)) rows[y] += 2;
  const bands = runs(rows, width * .22, Math.max(35, height * .04));
  const tiles = [];
  for (const [top, bottom] of bands) {
    const h = bottom - top;
    if (h > height * .55) continue;
    const columns = Array(width).fill(0);
    for (let x = 0; x < width; x++) for (let y = top + Math.floor(h * .15); y < top + h * .8; y += 2) if (lit(x, y)) columns[x] += 2;
    for (const [left, right] of runs(columns, h * .22, Math.max(55, width * .04))) {
      const w = right - left;
      if (w / h < 1.1 || w / h > 2.8 || w > width * .7) continue;
      tiles.push({ x: left, y: top, width: w, height: h });
    }
  }
  const widths = tiles.map(t => t.width).sort((a, b) => a - b), median = widths[Math.floor(widths.length / 2)] || 0;
  return tiles.slice(0, 100).map(t => t.width < median * .9 && t.width > median * .65 ? { ...t, x: Math.max(0, Math.min(width - median, t.x - (median - t.width) / 2)), width: median } : t);
}
export function manualTiles(width, height, grid) {
  const { left, top, right, bottom, columns, rows } = grid;
  if (![left, top, right, bottom].every(v => Number.isFinite(v) && v >= 0 && v <= 100) || !Number.isInteger(columns) || !Number.isInteger(rows) || left >= right || top >= bottom || columns < 1 || rows < 1 || columns * rows > 100) throw new Error('INVALID_GRID');
  const w = width * (right - left) / 100 / columns, h = height * (bottom - top) / 100 / rows;
  return Array.from({ length: rows * columns }, (_, i) => ({ x: width * left / 100 + (i % columns) * w + 2, y: height * top / 100 + Math.floor(i / columns) * h + 2, width: Math.max(1, w - 4), height: Math.max(1, h - 4) }));
}
export function cropTile(canvas, rect) {
  const output = document.createElement('canvas'); output.width = output.height = 160;
  const h = rect.height * .77, side = Math.min(rect.width, h), x = rect.x + (rect.width - side) / 2;
  output.getContext('2d').drawImage(canvas, x, rect.y, side, side, 0, 0, 160, 160);
  return output.toDataURL('image/jpeg', .85);
}
export function nameStrip(canvas, rect, preprocess = true) {
  const out = document.createElement('canvas'); out.width = 1000; out.height = 104;
  const ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 104);
  // Skip the microphone icon. Leave the visible label intact for human review.
  const x = rect.x + rect.width * .085, y = rect.y + rect.height * .78, w = rect.width * .9, h = rect.height * .19;
  const scale = Math.min(4, 1000 / w, 96 / h);
  ctx.drawImage(canvas, x, y, w, h, 0, 4, w * scale, h * scale);
  if (!preprocess) return out;
  const pixels = ctx.getImageData(0, 4, Math.ceil(w * scale), Math.ceil(h * scale));
  // Zoom's white label on a dark overlay becomes dark text on white.
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = 255 - (pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray < 145 ? 0 : 255;
  }
  ctx.putImageData(pixels, 0, 4);
  return out;
}
export async function makeNameSheet(canvas, tiles) {
  const sheet = document.createElement('canvas'); sheet.width = 1024; sheet.height = tiles.length * 128;
  const ctx = sheet.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  tiles.forEach((tile, i) => ctx.drawImage(nameStrip(canvas, tile), 12, i * 128 + 12));
  return new Promise((resolve, reject) => sheet.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_FAILED')), 'image/png'));
}
