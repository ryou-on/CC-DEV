// 台形(パースペクティブ)補正
// 本棚写真の背表紙(ほぼ垂直な線群)と棚板(ほぼ水平な線群)から消失点を推定し、
// 両消失点を無限遠へ送るホモグラフィで矩形化する。回転(水平出し)も同時に吸収される。
// 推定が不安定な場合は null を返し、呼び出し側が従来の回転補正へフォールバックする。

type V3 = [number, number, number]
type M3 = number[] // 3x3 row-major

const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function mul3(a: M3, b: M3): M3 {
  const r = new Array(9).fill(0)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return r
}

function apply3(h: M3, p: V3): V3 {
  return [
    h[0] * p[0] + h[1] * p[1] + h[2] * p[2],
    h[3] * p[0] + h[4] * p[1] + h[5] * p[2],
    h[6] * p[0] + h[7] * p[1] + h[8] * p[2],
  ]
}

export function inv3(m: M3): M3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det]
}

export interface EdgeSample {
  x: number
  y: number
  e: number // エッジ方向(0..180度、+x軸基準、y下向き座標)
  w: number // 重み(勾配強度)
}

// Sobel勾配からエッジ標本を収集(垂直族: 90°±tol / 水平族: 0°±tol)
// mask がある場合、無効画素(ワープの枠外)に接する画素はスキップ
export function collectEdgeSamples(
  gray: Float32Array,
  w: number,
  h: number,
  tol = 20,
  mask?: Uint8Array,
): { vert: EdgeSample[]; horiz: EdgeSample[] } {
  const vert: EdgeSample[] = []
  const horiz: EdgeSample[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mask && !(mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w])) continue
      const gx =
        gray[i + 1 - w] + 2 * gray[i + 1] + gray[i + 1 + w] -
        (gray[i - 1 - w] + 2 * gray[i - 1] + gray[i - 1 + w])
      const gy =
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] -
        (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1])
      const mag2 = gx * gx + gy * gy
      if (mag2 < 2500) continue
      const grad = (Math.atan2(gy, gx) * 180) / Math.PI
      const e = (((grad + 90) % 180) + 180) % 180 // エッジ方向 0..180
      const wgt = Math.sqrt(mag2)
      if (Math.abs(e - 90) <= tol) vert.push({ x, y, e, w: wgt })
      else if (e <= tol || e >= 180 - tol) horiz.push({ x, y, e, w: wgt })
    }
  }
  return { vert, horiz }
}

// 帯(バンド)内の代表線: 重み付き重心 + 軸性データの平均方向(2倍角法)
function bandLine(samples: EdgeSample[]): { line: V3; angle: number; weight: number } | null {
  let sw = 0, sx = 0, sy = 0, sc = 0, ss = 0
  for (const s of samples) {
    sw += s.w
    sx += s.x * s.w
    sy += s.y * s.w
    const r2 = (s.e * 2 * Math.PI) / 180
    sc += Math.cos(r2) * s.w
    ss += Math.sin(r2) * s.w
  }
  if (sw === 0) return null
  const cx = sx / sw
  const cy = sy / sw
  const ang = Math.atan2(ss, sc) / 2 // ラジアン、エッジ方向(mod π)
  const d: V3 = [Math.cos(ang), Math.sin(ang), 0]
  const p: V3 = [cx, cy, 1]
  return { line: cross(p, [p[0] + d[0], p[1] + d[1], 1]), angle: (ang * 180) / Math.PI, weight: sw }
}

// 角度差(mod 180)を -90..90 に正規化
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > 90) d -= 180
  while (d < -90) d += 180
  return d
}

// 1つの線族から消失点を推定。
// VPは全標本の重み付き最小二乗(各エッジが張る直線との距離二乗和の最小化)、
// 収束角(平行かどうかの判定用)は2バンドの代表方向の差で測る。
function familyVp(
  samples: EdgeSample[],
  axis: 'x' | 'y',
  size: number,
  minWeightRatio: number,
  totalW: number,
): { vp: V3; converge: number } | null {
  const lo = samples.filter((s) => (axis === 'x' ? s.x : s.y) < size * 0.45)
  const hi = samples.filter((s) => (axis === 'x' ? s.x : s.y) > size * 0.55)
  const bl = bandLine(lo)
  const bh = bandLine(hi)
  if (!bl || !bh) return null
  if (bl.weight < totalW * minWeightRatio || bh.weight < totalW * minWeightRatio) return null
  const conv = angleDiff(bh.angle, bl.angle)
  if (Math.abs(conv) > 14) return null // 収束が極端 → 推定不良とみなす
  if (Math.abs(conv) < 0.25) {
    // ほぼ平行 → 無限遠の消失点(平均方向)
    const meanDir = bandLine([...lo, ...hi])!
    const r = (meanDir.angle * Math.PI) / 180
    return { vp: [Math.cos(r), Math.sin(r), 0], converge: conv }
  }
  // 2バンドの代表線の交点をVPとする(反復精緻化で系統誤差を除去する前提)
  return { vp: cross(bl.line, bh.line), converge: conv }
}

// グレースケール画像を同一フレームへワープする(反復精緻化用、バイリニア)
// Hout2src: 出力px → 元px。枠外は mask=0
function warpGray(
  src: Float32Array,
  w: number,
  h: number,
  Hout2src: M3,
): { g: Float32Array; mask: Uint8Array } {
  const g = new Float32Array(w * h)
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const z = Hout2src[6] * x + Hout2src[7] * y + Hout2src[8]
      const sx = (Hout2src[0] * x + Hout2src[1] * y + Hout2src[2]) / z
      const sy = (Hout2src[3] * x + Hout2src[4] * y + Hout2src[5]) / z
      const o = y * w + x
      if (!(sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1)) {
        g[o] = 128
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = y0 * w + x0
      g[o] =
        src[i00] * (1 - fx) * (1 - fy) +
        src[i00 + 1] * fx * (1 - fy) +
        src[i00 + w] * (1 - fx) * fy +
        src[i00 + w + 1] * fx * fy
      mask[o] = 1
    }
  }
  return { g, mask }
}

export interface RectifyResult {
  H: M3 // 元画像px → 矩形化後座標
  crop: { x: number; y: number; w: number; h: number } // 矩形化後座標での内接クロップ
}

// 1回分の推定(ガード・クロップなし)。歪みが検出できなければ null
function estimateOnce(
  vert: EdgeSample[],
  horiz: EdgeSample[],
  w: number,
  h: number,
  firstPass: boolean,
): { H: M3; maxConv: number } | null {
  let tv = 0
  for (const s of vert) tv += s.w
  let th = 0
  for (const s of horiz) th += s.w
  if (tv < 5000 || th < 5000) return null // どちらかの線族が乏しい

  const fv = familyVp(vert, 'x', w, 0.12, tv)
  const fh = familyVp(horiz, 'y', h, 0.12, th)
  if (!fv || !fh) return null
  // 両方ほぼ平行(台形歪みなし)。初回なら補正不要、反復中なら収束済み
  if (firstPass && Math.abs(fv.converge) < 0.3 && Math.abs(fh.converge) < 0.3) return null

  // 座標正規化(数値安定化): 中心原点・最大辺/2 でスケール
  const f = Math.max(w, h) / 2
  const N: M3 = [1 / f, 0, -w / 2 / f, 0, 1 / f, -h / 2 / f, 0, 0, 1]
  const Ninv = inv3(N)!
  // 同次座標の成分スケールを揃える(数値安定化)
  const unitize = (p: V3): V3 => {
    const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))
    return m > 0 ? [p[0] / m, p[1] / m, p[2] / m] : p
  }
  const nvp = (p: V3): V3 => unitize(apply3(N, unitize(p)))
  const vpV = nvp(fv.vp)
  const vpH = nvp(fh.vp)

  // 射影補正: 画像上の消失線 l = vpH × vpV を無限遠へ
  const l = cross(vpH, vpV)
  const norm = Math.hypot(l[0], l[1])
  if (Math.abs(l[2]) < 1e-9 || norm / Math.abs(l[2]) > 50) {
    // 消失線がほぼ無限遠(歪みが小さい) → 補正不要
    return null
  }
  const Hp: M3 = [1, 0, 0, 0, 1, 0, l[0] / l[2], l[1] / l[2], 1]

  // アフィン補正: 射影補正後の2方向を x軸・y軸へ
  const dh3 = apply3(Hp, vpH)
  const dv3 = apply3(Hp, vpV)
  // 単位方向ベクトルへ正規化し、向きも揃える(dh→+x寄り, dv→+y寄り)
  const nh = Math.hypot(dh3[0], dh3[1])
  const nv = Math.hypot(dv3[0], dv3[1])
  if (nh < 1e-9 || nv < 1e-9) return null
  let dh = [dh3[0] / nh, dh3[1] / nh]
  let dv = [dv3[0] / nv, dv3[1] / nv]
  if (dh[0] < 0) dh = [-dh[0], -dh[1]]
  if (dv[1] < 0) dv = [-dv[0], -dv[1]]
  const det = dh[0] * dv[1] - dv[0] * dh[1]
  if (det < 0.5) return null // ほぼ平行/鏡映になる推定は棄却
  // [dh dv] の逆行列(dh→(1,0), dv→(0,1))
  const A: M3 = [dv[1] / det, -dv[0] / det, 0, -dh[1] / det, dh[0] / det, 0, 0, 0, 1]

  const Hn = mul3(A, Hp)
  const H = mul3(Ninv!, mul3(Hn, N))
  return { H, maxConv: Math.max(Math.abs(fv.converge), Math.abs(fh.converge)) }
}

// グレースケール画像からホモグラフィを推定する(純粋関数、テスト可能)。
// Sobel測定のバイアス(混在エッジ等)は歪み量に比例するため、
// 補正後の画像から標本を取り直しながら最大4回反復して収束させる
export function estimateRectifyFromGray(
  gray: Float32Array,
  w: number,
  h: number,
): RectifyResult | null {
  let Htot: M3 | null = null
  let g = gray
  let mask: Uint8Array | undefined
  for (let iter = 0; iter < 4; iter++) {
    const { vert, horiz } = collectEdgeSamples(g, w, h, 20, mask)
    const est = estimateOnce(vert, horiz, w, h, iter === 0)
    if (!est) {
      if (iter === 0) return null
      break
    }
    Htot = Htot ? mul3(est.H, Htot) : est.H
    if (est.maxConv < 0.25) break
    // 誤差の蓄積を避けるため、常に元画像から合成Hでワープし直して再測定する
    const Hinv = inv3(Htot)
    if (!Hinv) break
    const warped = warpGray(gray, w, h, Hinv)
    g = warped.g
    mask = warped.mask
  }
  if (!Htot) return null
  const H = Htot

  // 元画像の4隅を写して内接矩形(黒縁なしのクロップ)を求める
  const mapPt = (x: number, y: number) => {
    const q = apply3(H, [x, y, 1])
    if (Math.abs(q[2]) < 1e-9) return null
    return { x: q[0] / q[2], y: q[1] / q[2] }
  }
  const c00 = mapPt(0, 0)
  const c10 = mapPt(w, 0)
  const c01 = mapPt(0, h)
  const c11 = mapPt(w, h)
  if (!c00 || !c10 || !c01 || !c11) return null
  const left = Math.max(c00.x, c01.x)
  const right = Math.min(c10.x, c11.x)
  const top = Math.max(c00.y, c10.y)
  const bottom = Math.min(c01.y, c11.y)
  if (right - left < 1 || bottom - top < 1) return null

  // ガード: 外接と内接の比率が悪すぎる(=激しい変形)場合は補正しない
  const bboxW = Math.max(c10.x, c11.x) - Math.min(c00.x, c01.x)
  const bboxH = Math.max(c01.y, c11.y) - Math.min(c00.y, c10.y)
  const innerRatio = ((right - left) * (bottom - top)) / (bboxW * bboxH)
  if (innerRatio < 0.55) return null
  // 元画像とのスケール比も常識的な範囲に
  const scaleRatio = ((right - left) * (bottom - top)) / (w * h)
  if (scaleRatio < 0.4 || scaleRatio > 2.5) return null

  return { H, crop: { x: left, y: top, w: right - left, h: bottom - top } }
}

// ===== ここからブラウザ専用 =====

function toGray(source: CanvasImageSource, w: number, h: number): Float32Array {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114
  }
  return gray
}

// WebGLで逆写像ワープ(出力px → 元px)
function warpWebGL(
  bitmap: ImageBitmap,
  outW: number,
  outH: number,
  Hout2src: M3,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })
  if (!gl) return null
  const vsSrc = `
attribute vec2 a;
varying vec2 vOut;
uniform vec2 outSize;
void main() {
  gl_Position = vec4(a, 0.0, 1.0);
  vOut = vec2((a.x * 0.5 + 0.5) * outSize.x, (0.5 - a.y * 0.5) * outSize.y);
}`
  const fsSrc = `
precision highp float;
varying vec2 vOut;
uniform sampler2D tex;
uniform mat3 Hi;
uniform vec2 srcSize;
void main() {
  vec3 s = Hi * vec3(vOut, 1.0);
  vec2 p = s.xy / s.z;
  vec2 uv = p / srcSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  } else {
    gl_FragColor = texture2D(tex, uv);
  }
}`
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null
    return sh
  }
  const vs = compile(gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc)
  if (!vs || !fs) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)

  gl.uniform2f(gl.getUniformLocation(prog, 'outSize'), outW, outH)
  gl.uniform2f(gl.getUniformLocation(prog, 'srcSize'), bitmap.width, bitmap.height)
  // mat3 は列優先
  const Hm = Hout2src
  gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'Hi'), false, [
    Hm[0], Hm[3], Hm[6],
    Hm[1], Hm[4], Hm[7],
    Hm[2], Hm[5], Hm[8],
  ])
  gl.viewport(0, 0, outW, outH)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return canvas
}

// JSフォールバック(バイリニア補間)
function warpJs(
  bitmap: ImageBitmap,
  outW: number,
  outH: number,
  Hout2src: M3,
): HTMLCanvasElement {
  const srcCv = document.createElement('canvas')
  srcCv.width = bitmap.width
  srcCv.height = bitmap.height
  const sctx = srcCv.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(bitmap, 0, 0)
  const src = sctx.getImageData(0, 0, bitmap.width, bitmap.height)
  const out = new ImageData(outW, outH)
  const sw = bitmap.width
  const sh = bitmap.height
  const sd = src.data
  const od = out.data
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const z = Hout2src[6] * x + Hout2src[7] * y + Hout2src[8]
      const sx = (Hout2src[0] * x + Hout2src[1] * y + Hout2src[2]) / z
      const sy = (Hout2src[3] * x + Hout2src[4] * y + Hout2src[5]) / z
      const o = (y * outW + x) * 4
      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) {
        od[o] = od[o + 1] = od[o + 2] = 255
        od[o + 3] = 255
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + sw * 4
      const i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        od[o + c] =
          sd[i00 + c] * (1 - fx) * (1 - fy) +
          sd[i10 + c] * fx * (1 - fy) +
          sd[i01 + c] * (1 - fx) * fy +
          sd[i11 + c] * fx * fy
      }
      od[o + 3] = 255
    }
  }
  const cv = document.createElement('canvas')
  cv.width = outW
  cv.height = outH
  cv.getContext('2d')!.putImageData(out, 0, 0)
  return cv
}

// エントリポイント: 台形補正した canvas を返す。補正不要/不可能なら null
export function rectifyImage(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement | null {
  // 推定は縮小画像で行う
  const estW = 640
  const es = Math.min(1, estW / bitmap.width)
  const ew = Math.max(64, Math.round(bitmap.width * es))
  const eh = Math.max(64, Math.round(bitmap.height * es))
  const gray = toGray(bitmap, ew, eh)
  const est = estimateRectifyFromGray(gray, ew, eh)
  if (!est) return null

  // 推定座標(縮小) → 実処理座標(リサイズ後)へスケール
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const bw = Math.round(bitmap.width * scale)
  const sIn = bw / ew // 縮小座標→実座標
  const Sin: M3 = [1 / sIn, 0, 0, 0, 1 / sIn, 0, 0, 0, 1] // 実→縮小
  const Sout: M3 = [sIn, 0, 0, 0, sIn, 0, 0, 0, 1] // 縮小→実
  const Hbig = mul3(Sout, mul3(est.H, Sin)) // 実src → 実rect
  const crop = {
    x: est.crop.x * sIn,
    y: est.crop.y * sIn,
    w: est.crop.w * sIn,
    h: est.crop.h * sIn,
  }

  // 出力サイズ(クロップのアスペクト、maxEdge以内)
  const outScale = Math.min(1, maxEdge / Math.max(crop.w, crop.h))
  const outW = Math.max(16, Math.round(crop.w * outScale))
  const outH = Math.max(16, Math.round(crop.h * outScale))

  // 出力px → 実rect座標 → 実src座標
  const T: M3 = [crop.w / outW, 0, crop.x, 0, crop.h / outH, crop.y, 0, 0, 1]
  const Hinv = inv3(Hbig)
  if (!Hinv) return null
  const Hout2src0 = mul3(Hinv, T)
  // ソースはフル解像度のbitmapを使う(bw/bhへのリサイズをH側に織り込む)
  const S2: M3 = [1 / scale, 0, 0, 0, 1 / scale, 0, 0, 0, 1]
  const Hout2src = mul3(S2, Hout2src0)

  try {
    const gl = warpWebGL(bitmap, outW, outH, Hout2src)
    if (gl) return gl
  } catch { /* fallthrough */ }
  return warpJs(bitmap, outW, outH, Hout2src)
}
