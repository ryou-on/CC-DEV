// Natural Earth GeoJSON → 128x128 陸海マスク（RLE base36文字列）生成スクリプト
// 使い方: node gen-maps.mjs  （/tmp/ne_{110m,50m,10m}_land.geojson を読み /tmp/maps_out.json を出力）
import fs from 'fs';

const W = 128, H = 128;

// GeoJSONからポリゴン（リング配列）一覧を取り出す
function loadLand(path) {
  const g = JSON.parse(fs.readFileSync(path, 'utf8'));
  const polys = [];
  for (const f of g.features) {
    const gm = f.geometry;
    if (!gm) continue;
    if (gm.type === 'Polygon') polys.push(gm.coordinates);
    else if (gm.type === 'MultiPolygon') for (const c of gm.coordinates) polys.push(c);
  }
  return polys;
}
function ringBBox(r) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function prep(polys) { return polys.map(rings => ({ rings, bb: ringBBox(rings[0]) })); }

// レイキャスティング法 点in多角形
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function landAt(polys, lon, lat) {
  for (const p of polys) {
    const b = p.bb;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (inRing(lon, lat, p.rings[0])) {
      let hole = false;
      for (let k = 1; k < p.rings.length; k++) if (inRing(lon, lat, p.rings[k])) { hole = true; break; }
      if (!hole) return true;
    }
  }
  return false;
}

// Webメルカトル全球（latCut以南は海にする＝南極除去）
function rasterMerc(polys, latCut) {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const my = Math.PI * (1 - 2 * (y + 0.5) / H);
    const lat = Math.atan(Math.sinh(my)) * 180 / Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5) / W * 360 - 180;
      m[y * W + x] = (lat > latCut && landAt(polys, lon, lat)) ? 1 : 0;
    }
  }
  return m;
}
// 矩形範囲 正距円筒
function rasterBox(polys, lon0, lat0, lon1, lat1) {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const lat = lat1 - (y + 0.5) / H * (lat1 - lat0);
    for (let x = 0; x < W; x++) {
      const lon = lon0 + (x + 0.5) / W * (lon1 - lon0);
      m[y * W + x] = landAt(polys, lon, lat) ? 1 : 0;
    }
  }
  return m;
}

// RLE: 海始まりの交互ラン長をbase36+'.'区切りで
function rle(m) {
  const runs = []; let v = 0, c = 0;
  for (let i = 0; i < m.length; i++) {
    if (m[i] === v) c++; else { runs.push(c); v ^= 1; c = 1; }
  }
  runs.push(c);
  return runs.map(n => n.toString(36)).join('.');
}
function pct(m) { let s = 0; for (const v of m) s += v; return (100 * s / m.length).toFixed(1); }
function ascii(m) {
  let out = '';
  for (let y = 0; y < H; y += 2) {
    let line = '';
    for (let x = 0; x < W; x++) line += (m[y * W + x] ? '#' : '.');
    out += line + '\n';
  }
  return out;
}

console.error('loading 110m...');
const w110 = prep(loadLand('/tmp/ne_110m_land.geojson'));
console.error('loading 50m...');
const w50 = prep(loadLand('/tmp/ne_50m_land.geojson'));
console.error('loading 10m...');
const w10 = prep(loadLand('/tmp/ne_10m_land.geojson'));

console.error('raster world...');
const world = rasterMerc(w110, -63);
console.error('raster japan...');
const japan = rasterBox(w50, 129, 30.5, 147, 45.8);
console.error('raster tokyo...');
const tokyo = rasterBox(w10, 139.2, 34.85, 140.4, 36.05);

fs.writeFileSync('/tmp/maps_out.json', JSON.stringify({ world: rle(world), japan: rle(japan), tokyo: rle(tokyo) }));
console.log('=== world ' + pct(world) + '% land ===');
console.log(ascii(world));
console.log('=== japan ' + pct(japan) + '% land ===');
console.log(ascii(japan));
console.log('=== tokyo ' + pct(tokyo) + '% land ===');
console.log(ascii(tokyo));
console.log('bytes:', JSON.stringify({ world: rle(world).length, japan: rle(japan).length, tokyo: rle(tokyo).length }));
