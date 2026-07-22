
// ===== Kindle Auto Capturer v5.2.4 — Viewer =====
const { jsPDF } = window.jspdf || {};
const container = document.getElementById('container');
const info = document.getElementById('info');
const pWrap = document.getElementById('pWrap');
const pBar = document.getElementById('pBar');
const slider = document.getElementById('sizeSlider');
const cropBtn = document.getElementById('cropBtn');

// ===== バージョン不一致の検知 =====
// ファイル更新後に chrome://extensions の「⟳ 更新」を押し忘れると、
// 拡張本体（撮影側 background.js）が旧バージョンのまま動き続け、
// 「修正したはずの問題が直らない」事故になる。編集画面（このファイル）の
// バージョンと、実際にロードされている拡張本体のバージョンを比較して警告する
const VIEWER_VERSION = '5.29.0';
try {
  const loaded = chrome.runtime.getManifest().version;
  if (loaded !== VIEWER_VERSION) {
    const warn = document.createElement('div');
    warn.style.cssText = 'position:fixed;top:60px;left:0;right:0;z-index:2500;background:#dc2626;color:#fff;font:bold 13px/1.7 sans-serif;padding:10px 16px;text-align:center;';
    warn.textContent = '⚠ 拡張本体が v' + loaded + ' のまま実行されています（このファイルは v' + VIEWER_VERSION + '）。撮影側の修正が反映されていません。chrome://extensions で「⟳ 更新」を押してから撮影・編集をやり直してください。';
    document.body.appendChild(warn);
  }
} catch (e) {}

// ===== Undo / Redo（スナップショット方式） =====
// 削除・重複削除・2分割・見開き検知・結合・トリミング・マージンの各操作の
// 直前に「全カードの並びと状態」を積み、戻す/やり直すで復元する。
// カードのDOMノード自体は捨てずに参照で保持するため復元は高速
// （差し替え・追加は元データを書き換えるためUndo対象外）
let undoStack = [], redoStack = [];
const UNDO_MAX = 50;

function captureState() {
  return Array.from(container.children).map(c => ({
    node: c,
    crop: { ...c._cropRect },
    band: { ...c._bandRect },
    manual: c._manualRect ? { ...c._manualRect } : null,
    margin: c._marginFrac ? { ...c._marginFrac } : null
  }));
}

// 操作の直前に呼ぶ。新しい操作をしたらRedo履歴は破棄する
function pushUndo() {
  undoStack.push(captureState());
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
}

async function restoreState(state) {
  // 並びを復元（スナップショットに無いカードは外れる）
  const frag = document.createDocumentFragment();
  state.forEach(s => frag.appendChild(s.node));
  container.innerHTML = '';
  container.appendChild(frag);
  // 状態を復元し、変わったカードだけ再描画
  const dirty = [];
  for (const s of state) {
    const c = s.node;
    const before = JSON.stringify([c._cropRect, c._bandRect, c._manualRect || null, c._marginFrac || null]);
    const after = JSON.stringify([s.crop, s.band, s.manual, s.margin]);
    c._cropRect = { ...s.crop };
    c._bandRect = { ...s.band };
    if (s.manual) c._manualRect = { ...s.manual }; else delete c._manualRect;
    if (s.margin) c._marginFrac = { ...s.margin }; else delete c._marginFrac;
    if (before !== after) dirty.push(c);
  }
  const byImg = new Map();
  dirty.forEach(c => {
    if (!byImg.has(c._imgIdx)) byImg.set(c._imgIdx, []);
    byImg.get(c._imgIdx).push(c);
  });
  const img = new Image();
  for (const [idx, cs] of byImg) {
    img.src = rawImages[idx];
    try { await img.decode(); } catch (e) { continue; }
    cs.forEach(c => drawCard(c, img, cropEnabled));
  }
  reindex();
}

async function doUndo() {
  if (!undoStack.length) { info.innerText = "取り消す操作がありません"; return; }
  redoStack.push(captureState());
  await restoreState(undoStack.pop());
  info.innerText = "取り消しました（やり直し: ↪ / Ctrl+Shift+Z）";
}

async function doRedo() {
  if (!redoStack.length) { info.innerText = "やり直す操作がありません"; return; }
  undoStack.push(captureState());
  await restoreState(redoStack.pop());
  info.innerText = "やり直しました";
}
let focusIdx = 0;
let lastCheckIdx = -1;
let firstBase64 = null;
let bookConfig = {};
let rawImages = [];      // dataURL文字列（トグル時の再描画に使用）
let cropEnabled = true;  // 余白カット ON/OFF
let bookAspect = null;   // 本の縦横比（表紙から算出。文章本の分割に使用）
let globalGutterRel = null; // 見開きのノド位置（帯基準の相対座標・全キャプチャの中央値）
let autoDedupDone = false;  // 初回表示時の重複自動削除を一度だけ実行するためのフラグ
let importedFlags = []; // 各rawImagesが手動差し替え/追加の画像か（true=そのまま1枚扱い）

const MAX_CANVAS_H = 2000; // メモリ対策: この高さを超える場合は縮小して描画

if (!jsPDF) info.innerText = "エラー: jspdf.min.js が読み込めませんでした";

let typeName = ''; // 判定した本のタイプ表示名

chrome.storage.local.get(['capMeta', 'capturedImages', 'config', 'importedFlags', 'lastCaptureError'], async (data) => {
  bookConfig = data.config || {};
  importedFlags = data.importedFlags || [];

  // 直前の撮影が保存に失敗している場合、その詳細を表示する
  // （バナーは消えても、ここを見れば「何の保存が・なぜ失敗したか」が分かる）
  if (data.lastCaptureError) {
    const le = data.lastCaptureError;
    const d = new Date(le.time);
    const when = (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, '0');
    const mb = le.bytesInUse >= 0 ? "・使用容量" + Math.round(le.bytesInUse / 1048576) + "MB" : "";
    const warn = document.createElement('div');
    warn.style.cssText = 'position:fixed;top:100px;left:0;right:0;z-index:2500;background:#dc2626;color:#fff;font:bold 13px/1.7 sans-serif;padding:10px 16px;text-align:center;';
    warn.textContent = '⚠ 前回の撮影（' + when + '・' + le.count + '枚）は保存に失敗しています → ' + le.msg + mb +
      ' ｜ 下に表示されているのは以前に成功した撮影データです。';
    document.body.appendChild(warn);
  }
  if (data.capMeta && data.capMeta.count > 0) {
    // 分割保存形式（v5.28.3〜）: img_0..img_{N-1} をまとめて読み込む。
    // 巨大な本でも1回の読み書きが小さく済み、保存失敗で前回の本が
    // 表示され続ける事故を防ぐ
    const n = data.capMeta.count;
    rawImages = new Array(n);
    const CH = 20;
    for (let i = 0; i < n; i += CH) {
      const keys = [];
      for (let j = i; j < Math.min(i + CH, n); j++) keys.push('img_' + j);
      const chunk = await new Promise(r => chrome.storage.local.get(keys, r));
      keys.forEach((k, kk) => { rawImages[i + kk] = chunk[k]; });
      info.innerText = "読込: " + Math.min(i + CH, n) + "/" + n;
    }
    rawImages = rawImages.filter(Boolean);
    bookConfig.capturedAt = data.capMeta.capturedAt || null;
  } else {
    rawImages = data.capturedImages || []; // 旧形式フォールバック
  }
  while (importedFlags.length < rawImages.length) importedFlags.push(false);
  if (!rawImages.length) { info.innerText = "画像がありません"; return; }
  firstBase64 = rawImages[0];

  // 本のタイプを解決し、タイプ別プリセットを適用
  const btype = await resolveBookType();
  typeName = applyTypePresets(btype);

  // 分割モード切替（自動判定が外れた本を、その場で再構成できる）
  const splitSel = document.getElementById('splitSel');
  splitSel.value = bookConfig.splitMode || 'auto';
  splitSel.onchange = () => {
    bookConfig.splitMode = splitSel.value;
    renderAll(); // 削除・Undo履歴はリセットされる
  };

  setupReplaceInsert();
  await renderAll();
});

// ===== ページ画像の差し替え・追加 =====
// 表紙や一部ページだけ失敗したとき、手動で用意した画像で差し替え／追加できる。
// rawImages（＝元データ）自体を書き換えるので、再描画や再読込後も維持される
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej;
    r.readAsDataURL(file);
  });
}
async function persistImages() {
  // 分割保存形式で書き直す（backgroundの保存方式と同じ。巨大な一括setは失敗するため）
  const prev = await new Promise(r => chrome.storage.local.get(['capMeta'], r));
  const oldCount = (prev.capMeta && prev.capMeta.count) || 0;
  const rm = ['capturedImages'];
  for (let i = rawImages.length; i < oldCount; i++) rm.push('img_' + i); // 減った分の残骸を掃除
  await new Promise(r => chrome.storage.local.remove(rm, r));
  for (let i = 0; i < rawImages.length; i += 5) {
    const batch = {};
    for (let j = i; j < Math.min(i + 5, rawImages.length); j++) batch['img_' + j] = rawImages[j];
    await new Promise(r => chrome.storage.local.set(batch, r));
  }
  await new Promise(r => chrome.storage.local.set({
    capMeta: {
      count: rawImages.length,
      capturedAt: bookConfig.capturedAt || Date.now(),
      title: bookConfig.title || ''
    },
    importedFlags
  }, r));
}
function setupReplaceInsert() {
  const fileInput = document.getElementById('fileInput');
  const replaceBtn = document.getElementById('replaceBtn');
  const insertBtn = document.getElementById('insertBtn');
  let fileMode = 'replace';
  replaceBtn.onclick = () => {
    if (!container.children.length) { info.innerText = "差し替える対象ページを選んでください"; return; }
    fileMode = 'replace'; fileInput.multiple = false; fileInput.value = ''; fileInput.click();
  };
  insertBtn.onclick = () => {
    fileMode = 'insert'; fileInput.multiple = true; fileInput.value = ''; fileInput.click();
  };
  fileInput.onchange = async () => {
    const files = Array.from(fileInput.files || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const srcs = await Promise.all(files.map(readFileAsDataURL));
    const focusedCard = container.children[focusIdx];
    if (fileMode === 'replace') {
      const idx = focusedCard ? focusedCard._imgIdx : 0;
      rawImages[idx] = srcs[0];
      importedFlags[idx] = true;
      info.innerText = "P." + (focusIdx + 1) + " 相当のページを差し替えました";
    } else {
      const idx = focusedCard ? focusedCard._imgIdx : rawImages.length - 1;
      rawImages.splice(idx + 1, 0, ...srcs);
      importedFlags.splice(idx + 1, 0, ...srcs.map(() => true));
      info.innerText = srcs.length + " ページを追加しました";
    }
    await persistImages();
    await renderAll();
  };
}

// ===== 本のタイプ判定とプリセット =====
// text: 文章中心(リフロー) / manga: マンガ(固定・白黒) / magazine: 雑誌・写真集(固定・カラー)
async function resolveBookType() {
  const chosen = bookConfig.bookType;
  if (chosen && chosen !== 'auto') return chosen;
  if (bookConfig.detectedType === 'text') return 'text';
  // 固定レイアウト（または判定不能）: 本文の彩度で白黒(マンガ)かカラー(雑誌)かを推定。
  // 表紙はマンガでもカラーのため、本文中盤から3枚サンプリングして多数決を取る
  try {
    const n = rawImages.length;
    const samples = n >= 4
      ? [Math.floor(n * 0.3), Math.floor(n * 0.5), Math.floor(n * 0.7)]
      : [n - 1];
    let coloredVotes = 0;
    const oc = document.createElement('canvas');
    oc.width = 100; oc.height = 100;
    const ctx = oc.getContext('2d', { willReadFrequently: true });
    for (const idx of samples) {
      const img = new Image();
      img.src = rawImages[idx];
      await img.decode();
      ctx.drawImage(img, 0, 0, 100, 100);
      const d = ctx.getImageData(0, 0, 100, 100).data;
      let colored = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (mx - mn > 40) colored++;
      }
      if (colored / (d.length / 4) > 0.10) coloredVotes++;
    }
    return coloredVotes * 2 > samples.length ? 'magazine' : 'manga';
  } catch (e) { return 'manga'; }
}

function applyTypePresets(t) {
  const names = { text: '文章', manga: 'マンガ', magazine: '雑誌' };
  // 分割: 自動（文章は横長キャプチャを本の比率に合わせて分割、固定は見開き判定）
  if (!bookConfig.splitMode) bookConfig.splitMode = 'auto';
  // 余白カット: 雑誌は誌面の余白を残す方が自然なのでOFF（帯は常に除去される）
  cropEnabled = (t !== 'magazine');
  cropBtn.classList.toggle('off', !cropEnabled);
  cropBtn.innerText = cropEnabled ? '余白カット:ON' : '余白カット:OFF';
  bookConfig.resolvedType = t;
  return names[t] || '';
}

let rendering = false;
async function renderAll() {
  if (rendering) return;
  rendering = true;
  container.innerHTML = '';
  undoStack = []; redoStack = []; focusIdx = 0; lastCheckIdx = -1;
  firstBase64 = rawImages[0];
  const img = new Image();

  // パス1: 全キャプチャの矩形を解析
  const caps = [];
  chromeMaskCount = 0;
  const isFixed = bookConfig.resolvedType === 'manga' || bookConfig.resolvedType === 'magazine';
  for (let i = 0; i < rawImages.length; i++) {
    info.innerText = "解析: " + (i + 1) + "/" + rawImages.length;
    img.src = rawImages[i];
    try { await img.decode(); } catch (e) { caps.push(null); continue; }
    // 手動差し替え/追加の画像は、自動クロップ・分割・サイズ統一を適用せず1枚そのまま扱う
    if (importedFlags[i]) {
      const full = { x: 0, y: 0, w: img.width, h: img.height, lowConf: false };
      caps.push({ band: { ...full }, crop: { ...full }, iw: img.width, ih: img.height, imported: true });
      await new Promise(r => setTimeout(r, 0));
      continue;
    }
    const cap = { band: bandRect(img), crop: autoCrop(img), iw: img.width, ih: img.height };
    // 固定レイアウトの見開き候補: ノド位置の投票を収集（絶対座標。統一後に変換する）
    if (isFixed && cap.crop.w / cap.crop.h > 1.2) {
      const g = detectGutter(img, cap.crop);
      if (g.jump >= 15) cap.gutterVote = g.x;
      // 白い継ぎ目の投票。白地の本はノドに輝度ジャンプが無く、誌面デザインの
      // 色境界（毎ページ同じ位置に出る）を輝度ジャンプ方式が誤検出するため、
      // 「中央近傍のほぼ白の縦の継ぎ目」を別途投票し、こちらを優先する
      const s = findSpreadSeam(img, cap.crop, cap.crop.x + Math.floor(cap.crop.w / 2), Math.round(cap.crop.w * 0.08));
      if (s != null) cap.seamVote = s;
    }
    caps.push(cap);
    await new Promise(r => setTimeout(r, 0)); // UIをブロックしない
  }

  // 診断ログ: 文章タイプでサイズ不揃い報告があったとき、UI除外の効き具合をここで確認できる
  if (chromeMaskCount) {
    console.log("[リーダーUI除外] " + chromeMaskCount + "/" + rawImages.length +
      " 枚のキャプチャで書名/ページ番号の写り込みを検出し、検出枠から除外");
  }

  // 本のページサイズは途中で変わらない前提で、外れ値を補正
  normalizeRects(caps);

  // 見開きのノド位置を全キャプチャの中央値で統一（デザイン要素への誤反応を排除）。
  // 統一後のクロップ枠を基準にした相対座標で保持する
  globalGutterRel = null;
  const medVote = (key) => {
    const vs = caps.filter(c => c && c[key] != null)
      .map(c => c[key] - c.crop.x)
      .sort((a, b) => a - b);
    return vs.length >= 3 ? vs[Math.floor(vs.length / 2)] : null;
  };
  // 白い継ぎ目の投票を優先（白地の本で輝度ジャンプ方式が誌面の色境界を
  // 誤検出し、ノドが中央から大きくズレる事故への対策）。無ければ従来方式
  globalGutterRel = medVote('seamVote');
  if (globalGutterRel == null) globalGutterRel = medVote('gutterVote');

  // 本の縦横比を表紙（最初の信頼できる縦長キャプチャ）から決定。
  // 文章の本の横長キャプチャを、この比率に合わせて分割するのに使う
  bookAspect = null;
  for (const c of caps) {
    if (c && !c.imported && !c.crop.lowConf && c.crop.w / c.crop.h < 1.05) {
      bookAspect = c.crop.w / c.crop.h;
      break;
    }
  }
  if (!bookAspect) bookAspect = 0.71; // 見つからなければ文庫・A判相当

  // パス2: 補正済みの矩形でカードを生成
  for (let i = 0; i < rawImages.length; i++) {
    if (!caps[i]) continue;
    info.innerText = "描画: " + (i + 1) + "/" + rawImages.length;
    img.src = rawImages[i];
    try { await img.decode(); } catch (e) { continue; }
    buildCardsForImage(img, i, caps[i]);
    await new Promise(r => setTimeout(r, 0));
  }
  reindex();
  updateLayout();
  setFocus(0);
  // 初回表示時のみ、撮影時にすり抜けた連続重複を自動で掃除する
  // （分割/余白カット切替による再構成では実行しない。Ctrl+Zで取消可能）
  if (!autoDedupDone) {
    autoDedupDone = true;
    try { runDedup(true); } catch (e) {}
  }
  rendering = false;
}

// 検出が不安定なページ（ほぼ白紙でインク量が極端に少ない・ガード発動）だけを、
// 近くの正常ページと同じ矩形に揃える。左右交互配置を考慮して±2を優先して参照する。
// ※インクが十分あるページは、サイズが他と違っても本物（縮小表示の表紙等）なので触らない
function normalizeRects(caps) {
  const valid = caps.filter(c => c && !c.imported); // 手動差し替え画像は統一対象外
  if (valid.length < 5) return;
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

  // 固定レイアウト（マンガ・雑誌）: ページ枠は全編で一定なので、
  // 各ページの検出結果の中央値で枠を統一する。
  // 帯（黒帯）は左右交互に出る本があるため帯基準の相対座標を使うが、
  // ページ内容の黒縁を帯と誤検出したページに引きずられないよう、
  // 帯位置をクラスタリングして「多数派の本物の帯」だけをアンカーにする
  if (bookConfig.resolvedType === 'manga' || bookConfig.resolvedType === 'magazine') {
    const bucketOf = (c) => Math.round(c.band.x / 24) + ":" + Math.round(c.band.w / 24);
    const counts = {};
    for (const c of valid) counts[bucketOf(c)] = (counts[bucketOf(c)] || 0) + 1;
    const total = valid.length;
    // 全体の20%以上を占めるクラスタだけを「本物の帯位置」とみなす（交互帯なら2つ残る）
    const realBuckets = Object.keys(counts).filter(k => counts[k] >= Math.max(3, total * 0.2));
    const domBucket = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const repOf = {};
    for (const k of new Set(realBuckets.concat([domBucket]))) {
      const grp = valid.filter(c => bucketOf(c) === k);
      repOf[k] = {
        x: med(grp.map(c => c.band.x)), y: med(grp.map(c => c.band.y)),
        w: med(grp.map(c => c.band.w)), h: med(grp.map(c => c.band.h))
      };
    }
    const anchorOf = (c) => {
      const k = bucketOf(c);
      return repOf[k] && realBuckets.includes(k) ? repOf[k] : repOf[domBucket];
    };
    // 本文が見開き表示でも、表紙・裏表紙は1ページ表示で撮れることがあるため、
    // 自身の検出枠の縦横比で「見開き / 1ページ」に分類し、枠を別々に統一する
    const isSpreadCap = (c) => c.crop.w / c.crop.h > 1.15;
    const spreads = valid.filter(isSpreadCap);
    const singles = valid.filter(c => !isSpreadCap(c));
    const unifyGroup = (group) => {
      const g0 = group.filter(c => realBuckets.includes(bucketOf(c)));
      const g1 = g0.filter(c => !c.crop.lowConf);
      const src = g1.length >= 3 ? g1 : (g0.length ? g0 : group);
      if (!src.length) return null;
      return {
        x0: med(src.map(c => c.crop.x - anchorOf(c).x)),
        y0: med(src.map(c => c.crop.y - anchorOf(c).y)),
        x1: med(src.map(c => c.crop.x + c.crop.w - anchorOf(c).x)),
        y1: med(src.map(c => c.crop.y + c.crop.h - anchorOf(c).y))
      };
    };
    const major = spreads.length >= singles.length ? spreads : singles;
    const minor = major === spreads ? singles : spreads;
    const majRel = unifyGroup(major);
    const minRel = minor.length >= 5 ? unifyGroup(minor) : null; // 少数派はサンプル不足なら導出
    let unified = 0;
    for (const c of valid) {
      const a = anchorOf(c);
      const inMajor = major.includes(c);
      let x0, y0, x1, y1;
      if (inMajor && majRel) {
        x0 = a.x + majRel.x0; y0 = a.y + majRel.y0; x1 = a.x + majRel.x1; y1 = a.y + majRel.y1;
      } else if (minRel) {
        x0 = a.x + minRel.x0; y0 = a.y + minRel.y0; x1 = a.x + minRel.x1; y1 = a.y + minRel.y1;
      } else if (majRel) {
        // 少数派（表紙・裏表紙等）: 多数派の枠から導出する。
        // 多数派が見開きなら1ページ幅=見開き幅の半分、逆なら2倍。自身の内容中心に配置
        const majW = majRel.x1 - majRel.x0;
        const w = major === spreads ? Math.round(majW / 2) : majW * 2;
        const cx = c.crop.x + c.crop.w / 2;
        x0 = Math.round(cx - w / 2);
        x1 = x0 + w;
        y0 = a.y + majRel.y0; y1 = a.y + majRel.y1;
      } else {
        continue;
      }
      // 画像の範囲にだけクランプ（内容の黒縁で狭まった帯にはクランプしない）
      x0 = Math.max(0, x0); y0 = Math.max(0, y0);
      x1 = Math.min(c.iw, x1); y1 = Math.min(c.ih, y1);
      if (x1 - x0 > 100 && y1 - y0 > 100) {
        c.crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, lowConf: false };
        unified++;
      }
    }
    console.log("固定レイアウト: ページ枠を統一 (" + unified + "枚 / 見開き" + spreads.length + "・単ページ" + singles.length + ")");
    return;
  }
  const medW = med(valid.map(c => c.crop.w));
  const medH = med(valid.map(c => c.crop.h));
  const okSize = (c) => Math.abs(c.crop.w - medW) / medW <= 0.15 && Math.abs(c.crop.h - medH) / medH <= 0.15;
  let fixed = 0;
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    if (!c || !c.crop.lowConf) continue; // 信頼できる検出はそのまま
    let src = null;
    for (const off of [-2, 2, -4, 4, -1, 1, -3, 3, -6, 6, -5, 5]) {
      const n = caps[i + off];
      if (n && !n.crop.lowConf && okSize(n) && n.iw === c.iw && n.ih === c.ih) { src = n; break; }
    }
    if (!src) continue;
    c.crop = { ...src.crop, lowConf: false };
    fixed++;
  }
  // 章扉などインクが少なめでも検出は信頼できたページが標準サイズより小さい場合、
  // 内容を中心に標準サイズまで「広げる」（縮めることはしないので表紙等は保護される）
  let grown = 0;
  for (const c of caps) {
    if (!c || c.crop.lowConf) continue;
    const { x, y, w, h } = c.crop;
    if (w >= medW * 0.9 && h >= medH * 0.9) continue;
    const nw = Math.max(w, Math.round(medW));
    const nh = Math.max(h, Math.round(medH));
    const b = c.band; // 黒帯の内側にクランプ（帯を再び含めない）
    if (nw > b.w || nh > b.h) continue;
    let nx = Math.round(x + w / 2 - nw / 2);
    let ny = Math.round(y + h / 2 - nh / 2);
    nx = Math.max(b.x, Math.min(nx, b.x + b.w - nw));
    ny = Math.max(b.y, Math.min(ny, b.y + b.h - nh));
    c.crop = { x: nx, y: ny, w: nw, h: nh, lowConf: false };
    grown++;
  }
  if (fixed || grown) console.log("サイズ補正: 継承" + fixed + "枚 / 拡張" + grown + "枚");
}

// ===== 余白自動クロップ =====
// (1) 四隅の色を背景として内容の外接矩形を求め、白余白を除去
// (2) さらに各辺の「黒レターボックス／白余白の均一な帯」を削る（マンガの黒帯対策）
// 行インク量プロファイルから、画面の上下端に写り込んだリーダーUI
// （上端の書名バー・下端のページ番号/「読書速度を学習中…」等）の行を特定する。
// これらはページ内容と無関係な常時表示テキストで、表示されたり消えたりするため、
// 内容検出に含めるとページごとに枠サイズがバラつく（文章タイプで発生）。
// 条件: 本文の帯（最大の帯）から高さ2%以上離れた薄い帯（高さ3.5%以下）で、
// 上端3%以内から始まる（下端側は97%以降で終わる）もの。
// 戻り値: 除外行のUint8Array(1=除外)。該当なしは null
function readerChromeRows(rowInk, sh, noise) {
  const bands = [];
  let cur = null;
  for (let y = 0; y < sh; y++) {
    if (rowInk[y] > noise) { if (cur) cur.e = y; else cur = { s: y, e: y }; }
    else if (cur) { bands.push(cur); cur = null; }
  }
  if (cur) bands.push(cur);
  if (bands.length < 2) return null; // 帯が1つ以下（全面インクの表紙・白紙等）はUIなし
  let main = 0;
  for (let i = 1; i < bands.length; i++)
    if (bands[i].e - bands[i].s > bands[main].e - bands[main].s) main = i;
  const mask = new Uint8Array(sh);
  let found = false;
  for (let i = 0; i < bands.length; i++) {
    if (i === main) continue;
    const b = bands[i], h = b.e - b.s + 1;
    if (h > sh * 0.035) continue; // 厚い帯は本文・図版なので残す
    const isTop = i < main && b.s < sh * 0.03 && b.e < sh * 0.07 &&
      (bands[main].s - b.e) >= sh * 0.02;
    const isBottom = i > main && b.e > sh * 0.97 && b.s > sh * 0.93 &&
      (b.s - bands[main].e) >= sh * 0.02;
    if (!isTop && !isBottom) continue;
    for (let y = b.s; y <= b.e; y++) mask[y] = 1;
    found = true;
  }
  return found ? mask : null;
}
let chromeMaskCount = 0; // 診断用: リーダーUIを除外したキャプチャ数（renderAllでリセット・ログ）

function autoCrop(img) {
  const cw = img.width, ch = img.height;
  const scale = Math.min(1, 900 / Math.max(cw, ch)); // 解析は縮小画像で高速化
  const sw = Math.max(1, Math.round(cw * scale));
  const sh = Math.max(1, Math.round(ch * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; }
  catch (e) { return { x: 0, y: 0, w: cw, h: ch }; }

  // グレースケール配列（帯判定に使用）
  const g = new Uint8Array(sw * sh);
  for (let i = 0; i < g.length; i++) {
    g[i] = (raw[i * 4] * 0.299 + raw[i * 4 + 1] * 0.587 + raw[i * 4 + 2] * 0.114) | 0;
  }

  // (1) 四隅の平均を背景色として内容の外接矩形
  const c = [0, sw - 1, (sh - 1) * sw, (sh - 1) * sw + (sw - 1)];
  let br = 0, bg = 0, bb = 0;
  c.forEach(p => { br += raw[p * 4]; bg += raw[p * 4 + 1]; bb += raw[p * 4 + 2]; });
  br /= 4; bg /= 4; bb /= 4;
  const THRESH = 30; // 薄いグレーの絵柄も内容として拾う（JPEGノイズは合計~15程度なので誤検出しない）

  // (0) 文章タイプ: リーダーUI（書名/ページ番号）の写り込み行を検出対象から除外する。
  // フッター左の「読書速度を学習中…」は出たり消えたりするため、含めると
  // 検出枠の幅・高さがページごとにバラつく。また下端中央のページ番号は
  // 2段組の列間（分割の谷）に載るため、見開き分割の誤ブロックも起こす
  let rowSkip = null;
  if (bookConfig && bookConfig.resolvedType === 'text') {
    const rowInk = new Array(sh).fill(0);
    for (let y = 0; y < sh; y++) {
      let n = 0;
      for (let x = 0; x < sw; x++) {
        const o = (y * sw + x) * 4;
        if (Math.abs(raw[o] - br) + Math.abs(raw[o + 1] - bg) + Math.abs(raw[o + 2] - bb) > THRESH) n++;
      }
      rowInk[y] = n;
    }
    rowSkip = readerChromeRows(rowInk, sh, Math.max(1, sw * 0.002));
    if (rowSkip) chromeMaskCount++;
  }

  let minX = sw, minY = sh, maxX = -1, maxY = -1, inkCount = 0;
  for (let y = 0; y < sh; y++) {
    if (rowSkip && rowSkip[y]) continue;
    for (let x = 0; x < sw; x++) {
      const o = (y * sw + x) * 4;
      const diff = Math.abs(raw[o] - br) + Math.abs(raw[o + 1] - bg) + Math.abs(raw[o + 2] - bb);
      if (diff > THRESH) {
        inkCount++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: cw, h: ch, lowConf: true }; // 内容なし(白紙)

  // (2) 黒帯・白余白の均一な辺を各方向から削る
  // 「その辺の画素の98.5%以上が near-black だけ or near-white だけ」の場合のみ帯とみなす
  // → 黒文字＋白地のテキスト行（黒白が混在）は削られない
  let x0 = minX, y0 = minY, x1 = maxX, y1 = maxY;
  const BK = 20, WH = 250, R = 0.985; // 純黒/純白のみを帯とみなす（トーンや薄いグレーは削らない）
  // Kindleビューアの背景が真っ白でない薄グレーの場合（雑誌等）も帯として削れるよう、
  // 「純白」に加えて「四隅の背景色に近い明るい画素」も白系とみなす
  const bgL = br * 0.299 + bg * 0.587 + bb * 0.114;
  const isLight = (v) => v > WH || (bgL > 200 && Math.abs(v - bgL) <= 8);
  // 白系の帯判定は「比率」ではなく「インクの絶対量がほぼゼロ」で行う。
  // 比率(98.5%)だと文字数の少ない行（「よ」だけの会話行等）が帯と誤認され
  // 文字ごと削られてしまうため。1文字でもあれば保護される
  const inkLimit = (t) => Math.max(2, t * 0.003); // ノイズ許容量
  // 行（上下）は「白系」のみ帯として削る。黒レターボックスは左右にしか出ないため、
  // 黒を行方向でも削るとコマ枠の横線や黒ベタのコマを誤って食ってしまう
  const rowFlat = (y) => {
    let ink = 0, t = 0;
    for (let x = x0; x <= x1; x++) { if (!isLight(g[y * sw + x])) ink++; t++; }
    return ink <= inkLimit(t);
  };
  const colFlat = (x) => {
    let nb = 0, ink = 0, t = 0;
    for (let y = y0; y <= y1; y++) { const v = g[y * sw + x]; t++; if (v < BK) nb++; if (!isLight(v)) ink++; }
    return nb / t > R || ink <= inkLimit(t); // 黒帯は比率、白系は絶対量
  };
  // 行→列の順に1回だけだと「黒帯＋白余白の混在行」が削れないため、
  // 変化がなくなるまで交互に繰り返す（例: 左黒帯を削った後に下の白余白が削れるようになる）
  let changed = true;
  while (changed) {
    changed = false;
    while (y0 < y1 && rowFlat(y0)) { y0++; changed = true; }
    while (y1 > y0 && rowFlat(y1)) { y1--; changed = true; }
    while (x0 < x1 && colFlat(x0)) { x0++; changed = true; }
    while (x1 > x0 && colFlat(x1)) { x1--; changed = true; }
  }

  // 見切れ防止の余白: 各辺のすぐ外側が明るければ広め（実寸~18px）、
  // 黒帯なら最小限（黒縁の写り込みを防ぐ）に広げる
  const padFor = (side) => {
    const D = 6; // 外側のサンプル幅（縮小px）
    let sum = 0, n = 0;
    if (side === 'top') {
      for (let y = Math.max(0, y0 - D); y < y0; y++) for (let x = x0; x <= x1; x++) { sum += g[y * sw + x]; n++; }
    } else if (side === 'bottom') {
      for (let y = y1 + 1; y <= Math.min(sh - 1, y1 + D); y++) for (let x = x0; x <= x1; x++) { sum += g[y * sw + x]; n++; }
    } else if (side === 'left') {
      for (let x = Math.max(0, x0 - D); x < x0; x++) for (let y = y0; y <= y1; y++) { sum += g[y * sw + x]; n++; }
    } else {
      for (let x = x1 + 1; x <= Math.min(sw - 1, x1 + D); x++) for (let y = y0; y <= y1; y++) { sum += g[y * sw + x]; n++; }
    }
    if (!n) return 0;
    return (sum / n) > 128 ? 8 : 2;
  };
  y0 = Math.max(0, y0 - padFor('top'));
  y1 = Math.min(sh - 1, y1 + padFor('bottom'));
  x0 = Math.max(0, x0 - padFor('left'));
  x1 = Math.min(sw - 1, x1 + padFor('right'));

  const inv = 1 / scale;
  const X0 = Math.max(0, Math.floor(x0 * inv));
  const Y0 = Math.max(0, Math.floor(y0 * inv));
  const X1 = Math.min(cw, Math.ceil((x1 + 1) * inv));
  const Y1 = Math.min(ch, Math.ceil((y1 + 1) * inv));
  const rect = { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
  // 極端に小さい場合はクロップ無効化（誤検出保険）
  if (rect.w < cw * 0.10 || rect.h < ch * 0.10) return { x: 0, y: 0, w: cw, h: ch, lowConf: true };
  // インク量が極端に少ないページ（ほぼ白紙）は検出結果を信頼しない
  rect.lowConf = inkCount / (sw * sh) < 0.005;
  return rect;
}

// 左右の黒帯（レターボックス）だけを検出して除いた矩形を返す（白余白は残す）。
// 黒帯はキャプチャの副産物なので、余白カットOFFでも常に除去する
function bandRect(img) {
  const cw = img.width, ch = img.height;
  const scale = Math.min(1, 900 / Math.max(cw, ch));
  const sw = Math.max(1, Math.round(cw * scale));
  const sh = Math.max(1, Math.round(ch * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; }
  catch (e) { return { x: 0, y: 0, w: cw, h: ch }; }
  const BK = 20, R = 0.985;
  const colBlack = (x) => {
    let nb = 0;
    for (let y = 0; y < sh; y++) {
      const o = (y * sw + x) * 4;
      if (raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114 < BK) nb++;
    }
    return nb / sh > R;
  };
  let x0 = 0, x1 = sw - 1;
  while (x0 < x1 && colBlack(x0)) x0++;
  while (x1 > x0 && colBlack(x1)) x1--;
  const inv = 1 / scale;
  const X0 = Math.max(0, Math.floor(x0 * inv));
  const X1 = Math.min(cw, Math.ceil((x1 + 1) * inv));
  if (X1 - X0 < cw * 0.10) return { x: 0, y: 0, w: cw, h: ch };
  return { x: X0, y: 0, w: X1 - X0, h: ch };
}

// 横長のテキストページを本の比率に合わせてN分割する。
// 分割位置は「インクの谷」（列間の空白）にスナップし、縦書きの列を切らない
function splitAtValleys(img, rect, N, dir) {
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; } catch (e) { raw = null; }
  const rx0 = Math.round(rect.x * scale), ry0 = Math.round(rect.y * scale);
  const rx1 = Math.round((rect.x + rect.w) * scale), ry1 = Math.round((rect.y + rect.h) * scale);
  const colInk = (x) => {
    let n = 0;
    for (let y = ry0; y < ry1; y++) {
      const o = (y * sw + x) * 4;
      if (raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114 < 200) n++;
    }
    return n;
  };
  // 各分割位置で「空白の帯」（連続して最も空白な区間）を検出する。
  // 帯全体を両側のページに共有させることで、境界に余白を作りつつ
  // 隣の列には絶対に食い込まない（固定幅オーバーラップは列を侵食するためNG）
  const cuts = []; // {lo, hi} 実座標での空白帯
  for (let k = 1; k < N; k++) {
    const target = rx0 + Math.round((rx1 - rx0) * k / N);
    let loR, hiR;
    if (raw) {
      const win = Math.max(3, Math.round((rx1 - rx0) * 0.06)); // 等分点の±6%以内で谷を探す
      const wx0 = Math.max(rx0 + 2, target - win);
      const wx1 = Math.min(rx1 - 2, target + win);
      const ink = [];
      for (let x = wx0; x <= wx1; x++) ink.push(colInk(x));
      // 窓内の空白ラン（インクほぼゼロの連続区間）を列挙し、最も幅の広いランを選ぶ。
      // 見開きのノド（ページ間の空白）は列間・図版際の隙間より広いため、
      // 「最小インク位置」だとタイトルや図版の際の狭い隙間を選んで切れ端が出る
      const minInk = Math.min.apply(null, ink);
      const tol = minInk + 2; // にじみ（アンチエイリアス）許容
      let lo = 0, hi = 0, bestW = -1, bestDist = Infinity;
      let i = 0;
      while (i < ink.length) {
        if (ink[i] <= tol) {
          let j = i;
          while (j + 1 < ink.length && ink[j + 1] <= tol) j++;
          const w = j - i;
          const center = wx0 + Math.round((i + j) / 2);
          const dist = Math.abs(center - target);
          if (w > bestW || (w === bestW && dist < bestDist)) {
            bestW = w; bestDist = dist; lo = i; hi = j;
          }
          i = j + 1;
        } else i++;
      }
      loR = Math.round((wx0 + lo) / scale);
      hiR = Math.round((wx0 + hi) / scale);
    } else {
      loR = hiR = Math.round(target / scale);
    }
    cuts.push({ lo: loR, hi: hiR });
  }
  const parts = [];
  for (let i = 0; i < N; i++) {
    const startX = i === 0 ? rect.x : cuts[i - 1].lo;         // 前の空白帯の始まりから
    const endX = i === N - 1 ? rect.x + rect.w : cuts[i].hi;  // 次の空白帯の終わりまで
    parts.push({ x: startX, y: rect.y, w: endX - startX, h: rect.h });
  }
  // 縦書き（右開き）は右側が先のページ
  return dir === 'rtl' ? parts.reverse() : parts;
}

// 見開きのノド（実際のページ境界）候補を検出する。
// 左右のページの明るさが違う場合（白ページ×暗い広告等）、境界に強いエッジが出る。
// 戻り値 {x, jump}: 段差が最大の位置と強さ。個々の結果は全キャプチャの中央値で統一して使う
function detectGutter(img, rect) {
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; } catch (e) { raw = null; }
  const rx0 = Math.round(rect.x * scale), ry0 = Math.round(rect.y * scale);
  const rx1 = Math.round((rect.x + rect.w) * scale), ry1 = Math.round((rect.y + rect.h) * scale);
  const center = Math.round((rx0 + rx1) / 2);
  let result = { x: rect.x + Math.floor(rect.w / 2), jump: 0 };
  if (raw) {
    const colMean = (x) => {
      let s = 0, n = 0;
      for (let y = ry0; y < ry1; y++) {
        const o = (y * sw + x) * 4;
        s += raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114;
        n++;
      }
      return s / n;
    };
    const win = Math.max(4, Math.round((rx1 - rx0) * 0.06));
    const wx0 = Math.max(rx0 + 4, center - win);
    const wx1 = Math.min(rx1 - 4, center + win);
    const prof = [];
    for (let x = wx0; x <= wx1; x++) prof.push(colMean(x));
    let bestJump = 0, bestX = center;
    for (let i = 3; i < prof.length - 3; i++) {
      const jump = Math.abs(prof[i + 3] - prof[i - 3]);
      const x = wx0 + i;
      if (jump > bestJump || (jump === bestJump && Math.abs(x - center) < Math.abs(bestX - center))) {
        bestJump = jump; bestX = x;
      }
    }
    result = { x: Math.round(bestX / scale), jump: bestJump };
  }
  return result;
}

// 分割境界に内容が跨っていないかを調べる。以下のどちらかなら切らない:
// (a) 境界±2pxに縦方向の内容が多い（縦罫線・図版の本体・タイトルの縦線など）
// (b) 境界を横切る水平線がある（グラフの軸線・上下の罫線・図版の枠線など。
//     細い線1本でも図版が跨いでいる証拠になる）
// ヘッダーやノンブル程度（数%の跨ぎ・横断線なし）は分割してよい
function boundaryBlocksSplit(img, rect, bx) {
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; } catch (e) { return false; }
  const ry0 = Math.round(rect.y * scale), ry1 = Math.round((rect.y + rect.h) * scale);
  const cx = Math.round(bx * scale);
  const HALF = Math.max(6, Math.round(rect.w * scale * 0.012)); // 横断線の判定帯: 境界±約1.2%幅
  const bx0 = Math.max(0, cx - HALF), bx1 = Math.min(sw - 1, cx + HALF);
  const c0 = Math.max(0, cx - 2), c1 = Math.min(sw - 1, cx + 2);
  const bandW = bx1 - bx0 + 1;
  let inkRows = 0, rows = 0;
  for (let y = ry0; y < ry1; y++) {
    rows++;
    let bandInk = 0, centerInk = false;
    for (let x = bx0; x <= bx1; x++) {
      const o = (y * sw + x) * 4;
      const v = raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114;
      if (v < 220) {
        bandInk++;
        if (x >= c0 && x <= c1) centerInk = true;
      }
    }
    if (centerInk) inkRows++;
    if (bandInk >= bandW * 0.85) return true; // (b) 境界を横切る水平線
  }
  return rows ? (inkRows / rows) > 0.15 : false; // (a) 縦方向の内容
}

// 境界候補の近傍で「ほぼ白の縦の継ぎ目」を探す（見つかった実座標xを返す。無ければnull）。
// マンガはコマ枠の水平線が左右ページの同じ高さに並び、ノドの白い継ぎ目も狭いため、
// boundaryBlocksSplit（図版保護）が誤反応して分割がブロックされることがある。
// しかし通常の見開きなら必ずページ間に白い継ぎ目があるので、そこで切れば安全に分割できる。
// 継ぎ目を貫通する水平線（グラフ軸線・図版枠線）がある場合と、継ぎ目自体が無い場合
// （見開きイラスト・全面写真）は null ＝分割しない。
function findSpreadSeam(img, rect, bx, range) {
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; } catch (e) { return null; }
  const ry0 = Math.round(rect.y * scale), ry1 = Math.round((rect.y + rect.h) * scale);
  const rows = ry1 - ry0;
  if (rows <= 0) return null;
  const cx = Math.round(bx * scale);
  const r = Math.max(4, Math.round(range * scale));
  const x0 = Math.max(Math.round(rect.x * scale), cx - r);
  const x1 = Math.min(Math.round((rect.x + rect.w) * scale) - 1, cx + r);
  if (x1 <= x0) return null;
  // 列ごとのインク行数
  const ink = [];
  for (let x = x0; x <= x1; x++) {
    let c = 0;
    for (let y = ry0; y < ry1; y++) {
      const o = (y * sw + x) * 4;
      const v = raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114;
      if (v < 220) c++;
    }
    ink.push(c);
  }
  // 適格列の連続runを列挙（まず厳格=インクほぼゼロ、無ければ緩め=2%以下）
  const collect = (limit) => {
    const rs = [];
    let cur = null;
    for (let i = 0; i < ink.length; i++) {
      if (ink[i] <= limit) { if (cur) cur.e = i; else cur = { s: i, e: i }; }
      else if (cur) { rs.push(cur); cur = null; }
    }
    if (cur) rs.push(cur);
    return rs;
  };
  let runs = collect(Math.max(1, rows * 0.003));
  if (!runs.length) runs = collect(Math.max(2, rows * 0.02));
  if (!runs.length) return null;
  runs.sort((a, b) => Math.abs((a.s + a.e) / 2 + x0 - cx) - Math.abs((b.s + b.e) / 2 + x0 - cx));
  const run = runs[0];
  // 貫通チェック: runの全列がインクである行が1行でもあれば横断線＝図版が跨いでいる
  for (let y = ry0; y < ry1; y++) {
    let all = true;
    for (let x = x0 + run.s; x <= x0 + run.e; x++) {
      const o = (y * sw + x) * 4;
      const v = raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114;
      if (v >= 220) { all = false; break; }
    }
    if (all) return null;
  }
  return Math.round((x0 + (run.s + run.e) / 2) / scale);
}

// 分割ピース列の内側境界に図版等が跨っていないかを確認し、跨いでいれば分割を諦める
function splitCrossesContent(img, crop, cropPieces) {
  if (cropPieces.length < 2) return false;
  const sorted = [...cropPieces].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const center = Math.round(((sorted[i].x + sorted[i].w) + sorted[i + 1].x) / 2);
    if (boundaryBlocksSplit(img, crop, center)) return true;
  }
  return false;
}

// 見開き分割の判定（矩形のアスペクト比＋モード）
function decideSplit(rect, cfg) {
  const mode = cfg.splitMode || 'auto';
  if (mode === 'single') return false;
  if (mode === 'spread') return true;
  return (rect.w / rect.h) > 1.2; // auto: 明らかに横長なら見開き
}

// 矩形を分割して各ページの矩形配列を返す（rtl=右ページ先）
function pieces(rect, doSplit, dir) {
  if (!doSplit) return [rect];
  const hw = Math.floor(rect.w / 2);
  const a = { x: rect.x, y: rect.y, w: hw, h: rect.h };
  const b = { x: rect.x + hw, y: rect.y, w: rect.w - hw, h: rect.h };
  return dir === 'rtl' ? [b, a] : [a, b];
}

// 1キャプチャからカード群を生成（imgは復号済み）
function buildCardsForImage(img, imgIdx, cap) {
  const band = cap.band;   // 黒帯のみ除去（余白カットOFF時に使用）
  const crop = cap.crop;   // 黒帯＋白余白を除去（余白カットON時に使用・正規化済み）

  let cropPieces, bandPieces;
  const mode = bookConfig.splitMode || 'auto';
  const asp = crop.w / crop.h;

  // 表紙（先頭キャプチャ）・裏表紙（末尾キャプチャ）: リーダーのレイアウトが
  // 本文と異なることが多く、「全ページ同サイズ」の枠統一が合わないページ。
  // 枠統一を使わず独立判定し、内容の外接矩形そのものでカットする
  // （まわりの白地・背景を除去）。
  // 内容が見開き比率（横長）なら見開き表紙とみなして通常の分割処理に任せる
  let coverPiece = null;
  if (!cap.imported && (imgIdx === 0 || imgIdx === rawImages.length - 1) &&
      (bookConfig.resolvedType === 'manga' || bookConfig.resolvedType === 'magazine')) {
    const bb = inkBBox(img, band);
    if (bb && bb.w > 100 && bb.h > 100 && bb.w / bb.h <= 1.3) {
      const px = Math.max(4, Math.round(bb.w * 0.01));
      const py = Math.max(4, Math.round(bb.h * 0.01));
      const x0 = Math.max(band.x, bb.x - px), y0 = Math.max(band.y, bb.y - py);
      const x1 = Math.min(band.x + band.w, bb.x + bb.w + px);
      const y1 = Math.min(band.y + band.h, bb.y + bb.h + py);
      coverPiece = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    // 診断ログ: 表紙リサイズが効かない報告があったとき、ここの数値で原因を特定できる
    console.log("[表紙/裏表紙判定] idx=" + imgIdx,
      "bbox=", bb ? bb.x + "," + bb.y + " " + bb.w + "x" + bb.h + " (aspect " + (bb.w / bb.h).toFixed(2) + ")" : "検出失敗",
      "→", coverPiece ? "内容基準でリサイズ適用" : "適用せず（横長=見開き表紙とみなし通常処理）");
  }

  if (cap.imported) {
    // 手動差し替え/追加画像: 分割・クロップせず1枚そのまま
    cropPieces = [{ ...crop }];
    bandPieces = [{ ...band }];
  } else if (coverPiece) {
    cropPieces = [coverPiece];
    bandPieces = [{ ...coverPiece }];
  } else if (bookConfig.resolvedType === 'text' && mode === 'auto' && bookAspect && asp > bookAspect * 1.3) {
    // 文章の本の横長キャプチャ: 表紙の縦横比に合わせてN分割（列間の空白で切る）。
    // 分割境界は本文（クロップ）基準で1回だけ決め、余白カットOFF側も同じ境界を共有する。
    // 別々に計算するとON/OFFでページに載る列がズレ、「ONで左右の文字が消えた」ように見える
    const N = Math.min(4, Math.max(2, Math.round(asp / bookAspect)));
    cropPieces = splitAtValleys(img, crop, N, bookConfig.direction);
    if (splitCrossesContent(img, crop, cropPieces)) {
      // 図版などが境界を跨いでいる: 分割せず1ページに収める
      cropPieces = [{ ...crop }];
    }
    bandPieces = cropPieces.map(p => {
      const left = (p.x === crop.x) ? band.x : p.x;                              // 外端だけ余白まで広げる
      const right = (p.x + p.w === crop.x + crop.w) ? band.x + band.w : p.x + p.w;
      return { x: left, y: band.y, w: right - left, h: band.h };
    });
  } else {
    const doSplit = decideSplit(crop, bookConfig);
    if (doSplit) {
      // 固定レイアウト（マンガ・雑誌）は「レイアウトは全編一定」が前提:
      // 見開きは必ず左右に分割し（見開きイラストも紙の本と同様に左右へ割る）、
      // 分割位置は全編統一のノド位置に固定する（ページごとにカット位置を変えない）。
      // 図版保護・継ぎ目探索による位置調整は文章タイプのみに適用する
      const isFixedType = bookConfig.resolvedType === 'manga' || bookConfig.resolvedType === 'magazine';

      // 見開き分割: 全キャプチャで統一したノド境界を使う（無ければ中央）。
      // 境界はON/OFFで共有する。
      // 固定レイアウトでは左右ページは同じ幅のはずなので、中央から±4%を
      // 超えるノドは誤検出とみなして中央を使う（左右のページ幅が不揃いになり、
      // 片側に大きな白帯が残る事故への対策）
      let b = crop.x + Math.floor(crop.w / 2);
      if (globalGutterRel != null) {
        const gx = crop.x + globalGutterRel; // 統一クロップ基準の相対座標
        const tol = isFixedType ? 0.04 : 0.15;
        if (gx > crop.x + crop.w * (0.5 - tol) && gx < crop.x + crop.w * (0.5 + tol)) b = gx;
      }

      // 1P表示のページ（表紙・裏表紙等）が見開きサイズの枠の中央に写っていて、
      // 左右が大きく白いままのことがある。内容が枠幅の62%未満しか無ければ
      // 分割せず、内容中心に「見開きの半分幅」の枠を当てる（表紙が白帯ごと
      // 出力されたり、中央で真っ二つになる事故への対策）
      if (isFixedType) {
        const bb = inkBBox(img, crop);
        if (bb && bb.w < crop.w * 0.62) {
          const tw = Math.min(crop.w, Math.max(bb.w, Math.round(crop.w / 2)));
          let nx = Math.round(bb.x + bb.w / 2 - tw / 2);
          nx = Math.max(crop.x, Math.min(nx, crop.x + crop.w - tw));
          cropPieces = [{ x: nx, y: crop.y, w: tw, h: crop.h }];
          bandPieces = [{ x: nx, y: band.y, w: tw, h: band.h }];
          for (let k = 0; k < cropPieces.length; k++) {
            const card = createCard(imgIdx, cropPieces[k], bandPieces[k], cap.imported === true);
            container.appendChild(card);
            drawCard(card, img, cropEnabled);
          }
          return;
        }
      }
      let blocked = false;
      if (!isFixedType) {
        blocked = boundaryBlocksSplit(img, crop, b);
        if (blocked) {
          // ノドまで届く内容で誤ブロックされることがある。
          // 近傍にほぼ白の継ぎ目があればそこで分割（本当の見開き図版なら継ぎ目が無い）
          const seam = findSpreadSeam(img, crop, b, Math.max(8, Math.round(crop.w * 0.03)));
          if (seam != null && seam > crop.x + crop.w * 0.3 && seam < crop.x + crop.w * 0.7) {
            b = seam;
            blocked = false;
          }
        }
      }
      let eL = crop.x, eR = crop.x + crop.w; // 分割ピースの外端（左右均等化で広げることがある）
      if (blocked) {
        // 図版などがノドを跨いでいる見開き: 分割せず1ページに収める
        cropPieces = [{ ...crop }];
      } else {
        if (isFixedType) {
          // 固定レイアウトは左右ページを必ず同じ幅にする。ノドが厳密に中央で
          // なくても、境界から遠い側に合わせて短い側を帯の内側（白マージン）
          // まで外側に広げる（偶数・奇数ページでカットサイズが違う事故への対策）
          const half = Math.max(b - eL, eR - b);
          eL = Math.max(band.x, b - half);
          eR = Math.min(band.x + band.w, b + half);
        }
        const pL = { x: eL, y: crop.y, w: b - eL, h: crop.h };
        const pR = { x: b, y: crop.y, w: eR - b, h: crop.h };
        cropPieces = bookConfig.direction === 'rtl' ? [pR, pL] : [pL, pR];
      }
      bandPieces = cropPieces.map(p => {
        const left = (p.x === eL) ? Math.min(band.x, eL) : p.x;
        const right = (p.x + p.w === eR) ? Math.max(band.x + band.w, eR) : p.x + p.w;
        return { x: left, y: band.y, w: right - left, h: band.h };
      });
    } else {
      cropPieces = pieces(crop, false, bookConfig.direction);
      bandPieces = pieces(band, false, bookConfig.direction);
    }
  }

  for (let k = 0; k < cropPieces.length; k++) {
    const card = createCard(imgIdx, cropPieces[k], bandPieces[k], cap.imported === true);
    container.appendChild(card);
    drawCard(card, img, cropEnabled);
  }
}

// 矩形内の「白でない内容」の外接矩形を返す（実座標。内容が無ければnull）。
// JPEGノイズの点に引きずられないよう、列・行ごとのインク量プロファイルで判定する
function inkBBox(img, rect) {
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const cvs = document.createElement('canvas');
  cvs.width = sw; cvs.height = sh;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  let raw;
  try { raw = ctx.getImageData(0, 0, sw, sh).data; } catch (e) { return null; }
  const x0 = Math.max(0, Math.round(rect.x * scale)), x1 = Math.min(sw - 1, Math.round((rect.x + rect.w) * scale) - 1);
  const y0 = Math.max(0, Math.round(rect.y * scale)), y1 = Math.min(sh - 1, Math.round((rect.y + rect.h) * scale) - 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const lum = (x, y) => {
    const o = (y * sw + x) * 4;
    return raw[o] * 0.299 + raw[o + 1] * 0.587 + raw[o + 2] * 0.114;
  };
  // 背景の明るさを矩形の縁からサンプリング。明るい背景（通常の白）は従来の
  // 白閾値、暗い背景（ダークテーマのリーダー等）は背景との差分でインク判定する
  const border = [];
  for (let x = x0; x <= x1; x += 4) { border.push(lum(x, y0), lum(x, y1)); }
  for (let y = y0; y <= y1; y += 4) { border.push(lum(x0, y), lum(x1, y)); }
  border.sort((a, b) => a - b);
  const bgV = border[Math.floor(border.length / 2)] || 255;
  const isInk = bgV >= 200
    ? (v) => v < 245
    : (v) => Math.abs(v - bgV) > 30;
  const cols = new Array(x1 - x0 + 1).fill(0);
  const rows = new Array(y1 - y0 + 1).fill(0);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (isInk(lum(x, y))) { cols[x - x0]++; rows[y - y0]++; }
    }
  }
  const cMin = Math.max(2, (y1 - y0 + 1) * 0.004); // 内容列とみなす最低インク量
  const rMin = Math.max(2, (x1 - x0 + 1) * 0.004);
  let minx = -1, maxx = -1, miny = -1, maxy = -1;
  for (let i = 0; i < cols.length; i++) if (cols[i] >= cMin) { if (minx < 0) minx = i; maxx = i; }
  for (let i = 0; i < rows.length; i++) if (rows[i] >= rMin) { if (miny < 0) miny = i; maxy = i; }
  if (minx < 0 || miny < 0) return null;
  return {
    x: Math.round((x0 + minx) / scale), y: Math.round((y0 + miny) / scale),
    w: Math.round((maxx - minx + 1) / scale), h: Math.round((maxy - miny + 1) / scale)
  };
}

// カードDOMを生成（イベント込み）。呼び出し側でcontainerへ挿入しdrawCardする
function createCard(imgIdx, cropRect, bandRect, imported) {
  const card = document.createElement('div');
  card.className = 'page-card';
  card._imgIdx = imgIdx;
  card._cropRect = cropRect;
  card._bandRect = bandRect;
  card._imported = imported === true;

  const sel = document.createElement('input');
  sel.type = 'checkbox'; sel.className = 'selector';
  const cv = document.createElement('canvas');
  const badge = document.createElement('div'); badge.className = 'page-num';
  card.append(sel, cv, badge);

  sel.addEventListener('click', (e) => {
    e.stopPropagation();
    const cards = Array.from(container.children);
    const idx = cards.indexOf(card);
    if (e.shiftKey && lastCheckIdx >= 0 && lastCheckIdx < cards.length) {
      // 直前にチェックした位置から今回までの区間をまとめて選択
      const start = Math.min(idx, lastCheckIdx);
      const end = Math.max(idx, lastCheckIdx);
      for (let i = start; i <= end; i++) {
        cards[i].classList.add('selected');
        cards[i].querySelector('.selector').checked = true;
      }
    } else {
      card.classList.toggle('selected', sel.checked);
    }
    lastCheckIdx = idx;
  });
  card.onclick = (e) => {
    if (e.shiftKey) handleShiftSelect(card);
    else setFocus(Array.from(container.children).indexOf(card));
  };
  card.ondblclick = () => openTrimEditor(card);
  card.title = "ダブルクリックでトリミング編集";
  return card;
}

// ===== 見開きの強制2分割（自動分割が見送ったページの手動修正用） =====
// カードを左右2ページに分割する（imgは復号済みであること）。
// 分割位置は「ノド近傍の白い継ぎ目」→「全編統一のノド」→「中央」の順で決める。
// 図版保護は行わない（ユーザーが明示的に指示した強制分割のため）
function splitCardInTwo(card, img) {
  // 基準枠: 手動トリミングがあればそれ、なければ現在の表示に使われている枠
  const base = card._manualRect || (cropEnabled ? card._cropRect : card._bandRect);
  const band = card._manualRect || card._bandRect;
  // 分割位置
  let b = base.x + Math.floor(base.w / 2);
  if (globalGutterRel != null) {
    const gx = card._cropRect.x + globalGutterRel;
    if (gx > base.x + base.w * 0.35 && gx < base.x + base.w * 0.65) b = gx;
  }
  const seam = findSpreadSeam(img, base, b, Math.max(8, Math.round(base.w * 0.03)));
  if (seam != null && seam > base.x + base.w * 0.3 && seam < base.x + base.w * 0.7) b = seam;
  // クロップ枠とバンド枠（外端は帯除去枠まで広げ、内端は共有）
  const cL = { x: base.x, y: base.y, w: b - base.x, h: base.h };
  const cR = { x: b, y: base.y, w: base.x + base.w - b, h: base.h };
  const bandFor = (p) => {
    const left = (p.x === base.x) ? Math.min(band.x, p.x) : p.x;
    const right = (p.x + p.w === base.x + base.w) ? Math.max(band.x + band.w, p.x + p.w) : p.x + p.w;
    return { x: left, y: band.y, w: right - left, h: band.h };
  };
  const first = bookConfig.direction === 'rtl' ? cR : cL;
  const second = bookConfig.direction === 'rtl' ? cL : cR;
  // 既存カードを1ページ目に更新し、2ページ目を直後に挿入
  delete card._manualRect;
  card._cropRect = first;
  card._bandRect = bandFor(first);
  const twin = createCard(card._imgIdx, second, bandFor(second), card._imported);
  if (card._marginFrac) twin._marginFrac = { ...card._marginFrac };
  container.insertBefore(twin, card.nextSibling);
  drawCard(card, img, cropEnabled);
  drawCard(twin, img, cropEnabled);
  card.classList.remove('selected');
  const cb = card.querySelector('.selector'); if (cb) cb.checked = false;
  return true;
}

document.getElementById('splitBtn').onclick = async () => {
  let targets = Array.from(container.querySelectorAll('.page-card.selected'));
  if (!targets.length) {
    const f = container.querySelector('.page-card.focused');
    if (f) targets = [f];
  }
  if (!targets.length) { alert("分割するページを選択（またはクリックでフォーカス）してください"); return; }
  pushUndo();
  const img = new Image();
  let count = 0;
  for (const card of targets) {
    img.src = rawImages[card._imgIdx];
    try { await img.decode(); } catch (e) { continue; }
    if (splitCardInTwo(card, img)) count++;
  }
  reindex();
  info.innerText = count + "ページを2分割しました";
};

// ===== 見開き検知（横長のまま残ったページを自動検知して一括2分割） =====
document.getElementById('detectBtn').onclick = async () => {
  const cards = Array.from(container.querySelectorAll('.page-card'));
  const wide = cards.filter(c => {
    if (c._imported) return false;
    const r = c._manualRect || (cropEnabled ? c._cropRect : c._bandRect);
    return (r.w / r.h) > 1.15; // 見開き/1ページ分類と同じしきい値
  });
  if (!wide.length) { info.innerText = "見開き（横長）のページは見つかりませんでした"; return; }
  if (!confirm("横長（見開きのまま）のページが " + wide.length + " 件見つかりました。すべて2分割しますか？\n\n※本当の見開きイラストも分割されます。分割しすぎたページは、その左右2ページを選択して「結合」で1枚に戻せます。")) return;
  pushUndo();
  const img = new Image();
  let count = 0;
  for (const card of wide) {
    img.src = rawImages[card._imgIdx];
    try { await img.decode(); } catch (e) { continue; }
    if (splitCardInTwo(card, img)) count++;
    if (wide.length > 10) info.innerText = "分割中: " + count + "/" + wide.length;
  }
  reindex();
  info.innerText = count + "ページを2分割しました（見開き検知）";
};

// ===== 結合（分割の取り消し: 同じキャプチャ由来の隣接2ページを1枚に戻す） =====
// 誤って2分割したページや、自動分割を戻したいページに使う。
// 選択中（無ければフォーカス中）のカードについて、同じ元画像から作られた
// 隣のカードを探し、2枚の枠を合成した1枚に統合する
document.getElementById('mergeBtn').onclick = async () => {
  let targets = Array.from(container.querySelectorAll('.page-card.selected'));
  if (!targets.length) {
    const f = container.querySelector('.page-card.focused');
    if (f) targets = [f];
  }
  if (!targets.length) { alert("結合するページを選択（またはクリックでフォーカス）してください"); return; }
  pushUndo();
  const uni = (a, b) => {
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const done = new Set();
  const img = new Image();
  let count = 0;
  for (const card of targets) {
    if (done.has(card) || !card.isConnected) continue;
    // 同じキャプチャ由来の隣接カード（次を優先、無ければ前）
    let mate = null;
    const next = card.nextElementSibling, prev = card.previousElementSibling;
    if (next && next._imgIdx === card._imgIdx) mate = next;
    else if (prev && prev._imgIdx === card._imgIdx) mate = prev;
    if (!mate || done.has(mate)) continue;
    const keep = (mate === next) ? card : mate; // DOM上で前にある方を残す
    const drop = (mate === next) ? mate : card;
    keep._cropRect = uni(keep._cropRect, drop._cropRect);
    keep._bandRect = uni(keep._bandRect, drop._bandRect);
    delete keep._manualRect;
    drop.remove();
    done.add(keep); done.add(drop);
    img.src = rawImages[keep._imgIdx];
    try { await img.decode(); } catch (e) { continue; }
    drawCard(keep, img, cropEnabled);
    keep.classList.remove('selected');
    const cb = keep.querySelector('.selector'); if (cb) cb.checked = false;
    count++;
  }
  if (!count) { info.innerText = "結合できる隣接ページ（同じ撮影画像由来）が見つかりませんでした"; return; }
  reindex();
  info.innerText = count + "組を1ページに結合しました";
};

// カードのcanvasに指定ソース矩形を描画（必要なら縮小）
// 手動トリミング（_manualRect）があれば最優先。OFFでも黒帯は常に除去（_bandRect）
// 文章タイプ＋余白カットONでは、文字が枠ギリギリで読みにくくならないよう
// 外側に白マージンを付けて出力する（Kindleの「マージン: 幅広」相当）
function drawCard(card, img, useCrop) {
  const r = card._manualRect || (useCrop ? card._cropRect : card._bandRect);
  const cv = card.querySelector('canvas');
  let dw = r.w, dh = r.h;
  if (dh > MAX_CANVAS_H) { const s = MAX_CANVAS_H / dh; dw = Math.round(dw * s); dh = MAX_CANVAS_H; }
  // ページ個別のマージン指定（ツールバーの「マージン」メニュー）があれば最優先。
  // 未指定なら従来どおり: 文章タイプ＋余白カットONのみ標準マージン
  let mf = card._marginFrac;
  if (!mf) {
    mf = (useCrop && bookConfig.resolvedType === 'text' && !card._manualRect && !card._imported)
      ? { x: 0.07, y: 0.05 } : { x: 0, y: 0 };
  }
  const mx = Math.round(dw * mf.x);
  const my = Math.round(dh * mf.y);
  cv.width = dw + mx * 2;
  cv.height = dh + my * 2;
  const ctx = cv.getContext('2d');
  if (mx || my) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.drawImage(img, r.x, r.y, r.w, r.h, mx, my, dw, dh);
}

// 余白カットのON/OFFトグル（削除・並び順・選択を保持したまま再描画）
cropBtn.onclick = async () => {
  cropEnabled = !cropEnabled;
  cropBtn.classList.toggle('off', !cropEnabled);
  cropBtn.innerText = cropEnabled ? '余白カット:ON' : '余白カット:OFF';

  // 画像ごとに1回だけ復号して、そのカード群をまとめて再描画（メモリ節約）
  const cards = Array.from(container.querySelectorAll('.page-card'));
  const byImg = new Map();
  cards.forEach(c => {
    if (!byImg.has(c._imgIdx)) byImg.set(c._imgIdx, []);
    byImg.get(c._imgIdx).push(c);
  });
  const img = new Image();
  let done = 0;
  for (const [idx, cs] of byImg) {
    img.src = rawImages[idx];
    try { await img.decode(); } catch (e) { continue; }
    cs.forEach(c => drawCard(c, img, cropEnabled));
    done++;
    info.innerText = "再描画: " + done + "/" + byImg.size;
  }
  reindex();
};

// ===== 重複削除 =====
// カードのcanvasを32x32グレースケールに縮小した署名を返す
const SIG_W = 32, SIG_H = 32;
const DEDUP_DIFF = 6; // 1画素あたりの平均差分がこれ未満なら同一ページとみなす
function cardSignature(card) {
  const src = card.querySelector('canvas');
  const oc = document.createElement('canvas');
  oc.width = SIG_W; oc.height = SIG_H;
  const ctx = oc.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, SIG_W, SIG_H);
  const d = ctx.getImageData(0, 0, SIG_W, SIG_H).data;
  const g = new Uint8Array(SIG_W * SIG_H);
  for (let i = 0; i < g.length; i++) {
    g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
  }
  return g;
}
function meanAbsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// 連続する重複ページを1枚残して削除（Undo対応）
function runDedup(auto) {
  const cards = Array.from(container.querySelectorAll('.page-card'));
  if (cards.length < 2) { if (!auto) info.innerText = "重複判定できるページがありません"; return 0; }
  const removed = [];
  let lastSig = cardSignature(cards[0]);
  for (let i = 1; i < cards.length; i++) {
    const sig = cardSignature(cards[i]);
    if (meanAbsDiff(sig, lastSig) < DEDUP_DIFF) {
      removed.push({ node: cards[i], idx: i }); // 直前と同一→削除対象
    } else {
      lastSig = sig; // 内容が変わったので基準を更新
    }
  }
  if (!removed.length) { if (!auto) info.innerText = "重複ページはありませんでした"; return 0; }
  pushUndo(); // Ctrl+Z / ↩ で戻せる
  removed.forEach(r => r.node.remove());
  reindex();
  info.innerText = (auto ? "撮影時の重複 " : "") + removed.length + " 件の重複ページを削除しました（Ctrl+Zで取消）";
  return removed.length;
}
document.getElementById('dedupBtn').onclick = () => { runDedup(false); };

// ===== マージン調整（選択ページ／無選択なら全ページに適用） =====
const MARGIN_LEVELS = {
  none: { x: 0, y: 0 },
  narrow: { x: 0.03, y: 0.02 },
  std: { x: 0.07, y: 0.05 },
  wide: { x: 0.12, y: 0.09 }
};
const marginSel = document.getElementById('marginSel');
marginSel.onchange = async () => {
  const level = marginSel.value;
  marginSel.selectedIndex = 0; // メニューとして使うため表示を「マージン」に戻す
  const frac = MARGIN_LEVELS[level];
  if (!frac) return;
  const sel = Array.from(container.querySelectorAll('.page-card.selected'));
  const targets = sel.length ? sel : Array.from(container.querySelectorAll('.page-card'));
  if (!targets.length) return;
  pushUndo();
  targets.forEach(c => { c._marginFrac = { ...frac }; });
  // 画像ごとに1回だけ復号してまとめて再描画
  const byImg = new Map();
  targets.forEach(c => {
    if (!byImg.has(c._imgIdx)) byImg.set(c._imgIdx, []);
    byImg.get(c._imgIdx).push(c);
  });
  const img = new Image();
  let done = 0;
  for (const [idx, cs] of byImg) {
    img.src = rawImages[idx];
    try { await img.decode(); } catch (e) { continue; }
    cs.forEach(c => drawCard(c, img, cropEnabled));
    done++;
    if (byImg.size > 20) info.innerText = "マージン適用: " + done + "/" + byImg.size;
  }
  const names = { none: 'なし', narrow: '狭い', std: '標準', wide: '広い' };
  info.innerText = (sel.length ? sel.length + "ページ" : "全ページ") + "のマージンを「" + names[level] + "」にしました";
};

// ===== 選択・フォーカス =====
function handleShiftSelect(card) {
  const cards = Array.from(container.children);
  const curr = cards.indexOf(card);
  const anchor = lastCheckIdx < 0 ? curr : lastCheckIdx;
  const start = Math.min(curr, anchor);
  const end = Math.max(curr, anchor);
  for (let i = start; i <= end; i++) {
    cards[i].classList.add('selected');
    cards[i].querySelector('.selector').checked = true;
  }
  lastCheckIdx = curr;
}

function updateLayout() {
  container.style.gridTemplateColumns = `repeat(auto-fill, minmax(${slider.value}px, 1fr))`;
}
slider.oninput = updateLayout;

function reindex() {
  const cards = container.querySelectorAll('.page-card');
  cards.forEach((c, i) => { c.querySelector('.page-num').innerText = 'P.' + (i + 1); });
  // どの本のデータを表示しているか明示する（保存失敗などで前回の本が
  // 表示されたとき、書名・撮影時刻の食い違いですぐ気付けるように）
  let src = '';
  if (bookConfig.title) src += "『" + bookConfig.title + "』";
  if (bookConfig.capturedAt) {
    const d = new Date(bookConfig.capturedAt);
    src += " " + (d.getMonth() + 1) + "/" + d.getDate() + " " +
      d.getHours() + ":" + String(d.getMinutes()).padStart(2, '0') + "撮影";
  }
  info.innerText = "合計: " + cards.length + " ページ" + (typeName ? "（タイプ: " + typeName + "）" : "") + (src ? " ｜ " + src : "");
  if (focusIdx >= cards.length) focusIdx = cards.length - 1;
  if (focusIdx < 0) focusIdx = 0;
}

function setFocus(idx) {
  const cards = container.children;
  if (idx < 0 || idx >= cards.length) return;
  if (cards[focusIdx]) cards[focusIdx].classList.remove('focused');
  focusIdx = idx;
  lastCheckIdx = idx;
  cards[focusIdx].classList.add('focused');
  cards[focusIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 削除: チェック選択があれば「選択ページだけ」を削除する。
// フォーカス中ページを対象にするのは選択が1つも無いときだけ
// （以前は選択＋フォーカスの両方を消していたため、チェックした覚えのない
//  フォーカス中ページ＝初期状態では表紙まで一緒に消えてしまっていた）
document.getElementById('deleteBtn').onclick = () => {
  let targets = Array.from(container.querySelectorAll('.page-card.selected'));
  if (!targets.length) {
    const f = container.querySelector('.page-card.focused');
    if (f) targets = [f];
  }
  if (!targets.length) return;
  pushUndo();
  targets.forEach(c => c.remove());
  reindex();
  info.innerText = targets.length + "ページを削除しました（↩ / Ctrl+Zで取消）";
};

// 一括選択プルダウン: 全選択 / 偶数ページ / 奇数ページ / 選択解除
// （偶数・奇数は表示中のページ番号 P.n 基準。マージンやトリミングの
//  片側ページ一括調整に使う）
const selectSel = document.getElementById('selectSel');
selectSel.onchange = () => {
  const mode = selectSel.value;
  selectSel.selectedIndex = 0; // メニューとして使うため表示を「選択」に戻す
  const cards = Array.from(container.querySelectorAll('.page-card'));
  let n = 0;
  cards.forEach((c, i) => {
    const pageNo = i + 1;
    let on;
    if (mode === 'all') on = true;
    else if (mode === 'none') on = false;
    else if (mode === 'even') on = pageNo % 2 === 0;
    else if (mode === 'odd') on = pageNo % 2 === 1;
    else return;
    c.classList.toggle('selected', on);
    const cb = c.querySelector('.selector'); if (cb) cb.checked = on;
    if (on) n++;
  });
  const names = { all: '全ページ', even: '偶数ページ', odd: '奇数ページ', none: '' };
  info.innerText = mode === 'none' ? "選択を解除しました" : names[mode] + " " + n + "件を選択しました";
};

document.getElementById('undoBtn').onclick = () => { doUndo(); };
document.getElementById('redoBtn').onclick = () => { doRedo(); };

document.getElementById('closeBtn').onclick = () => {
  chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
};

window.onkeydown = (e) => {
  // トリミング編集中はショートカット無効（Escで閉じる）
  if (trimModal.style.display === 'flex') {
    if (e.key === 'Escape') trimModal.style.display = 'none';
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    doRedo();
    return;
  }
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  switch (e.key) {
    case 'j': setFocus(focusIdx + 1); break;
    case 'k': setFocus(focusIdx - 1); break;
    case 'x': {
      const c = container.children[focusIdx];
      if (c) { const on = c.classList.toggle('selected'); c.querySelector('.selector').checked = on; }
      break;
    }
    case 'y': document.getElementById('deleteBtn').click(); break;
  }
};

// ===== 個別トリミング編集（カードをダブルクリックで起動） =====
const trimModal = document.getElementById('trimModal');
const trimCanvas = document.getElementById('trimCanvas');
let trimCard = null, trimImg = null, trimRect = null, trimScale = 1, trimBaseRect = null;
let trimAutoRect = null; // 自動検出したページ枠（赤破線ガイドとして表示）
let dragMode = null, dragStart = null, rectStart = null;

async function openTrimEditor(card) {
  trimCard = card;
  trimImg = new Image();
  trimImg.src = rawImages[card._imgIdx];
  try { await trimImg.decode(); } catch (e) { return; }
  const r = card._manualRect || (cropEnabled ? card._cropRect : card._bandRect);
  trimRect = { x: r.x, y: r.y, w: r.w, h: r.h };
  trimBaseRect = { ...trimRect }; // 「選択ページにも適用」の調整量計算の基準
  trimAutoRect = cropEnabled ? card._cropRect : card._bandRect; // 本の縁（自動検出枠）ガイド
  const maxW = Math.min(window.innerWidth * 0.9, 1200);
  const maxH = window.innerHeight * 0.7;
  trimScale = Math.min(maxW / trimImg.width, maxH / trimImg.height, 1);
  trimCanvas.width = Math.round(trimImg.width * trimScale);
  trimCanvas.height = Math.round(trimImg.height * trimScale);
  drawTrim();
  trimModal.style.display = 'flex';
}

function trimHandles() {
  const s = trimScale, r = trimRect;
  const x0 = r.x * s, y0 = r.y * s, x1 = (r.x + r.w) * s, y1 = (r.y + r.h) * s;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return [
    { x: x0, y: y0, m: 'nw' }, { x: mx, y: y0, m: 'n' }, { x: x1, y: y0, m: 'ne' },
    { x: x0, y: my, m: 'w' }, { x: x1, y: my, m: 'e' },
    { x: x0, y: y1, m: 'sw' }, { x: mx, y: y1, m: 's' }, { x: x1, y: y1, m: 'se' }
  ];
}

function drawTrim() {
  const ctx = trimCanvas.getContext('2d');
  const s = trimScale, r = trimRect;
  ctx.drawImage(trimImg, 0, 0, trimCanvas.width, trimCanvas.height);
  // 枠の外側を暗くする
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, trimCanvas.width, r.y * s);
  ctx.fillRect(0, (r.y + r.h) * s, trimCanvas.width, trimCanvas.height - (r.y + r.h) * s);
  ctx.fillRect(0, r.y * s, r.x * s, r.h * s);
  ctx.fillRect((r.x + r.w) * s, r.y * s, trimCanvas.width - (r.x + r.w) * s, r.h * s);
  // ガイド線（赤・細）: 本の縁＝自動検出したページ枠（破線）、
  // 中心線＝現在のトリミング枠の縦横センター（実線）。
  // 枠をどれだけ動かしたか・ノドが中央に来ているかの目安になる
  ctx.save();
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
  if (trimAutoRect) {
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(trimAutoRect.x * s, trimAutoRect.y * s, trimAutoRect.w * s, trimAutoRect.h * s);
    ctx.setLineDash([]);
  }
  const gx = (r.x + r.w / 2) * s, gy = (r.y + r.h / 2) * s;
  ctx.beginPath();
  ctx.moveTo(gx, r.y * s); ctx.lineTo(gx, (r.y + r.h) * s);   // 縦の中心線
  ctx.moveTo(r.x * s, gy); ctx.lineTo((r.x + r.w) * s, gy);   // 横の中心線
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2;
  ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  ctx.fillStyle = '#818cf8';
  trimHandles().forEach(h => ctx.fillRect(h.x - 5, h.y - 5, 10, 10));
}

// canvasのCSS縮小を考慮してマウス座標を実キャンバス座標へ換算
function trimMousePos(e) {
  const rect = trimCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (trimCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (trimCanvas.height / rect.height)
  };
}

trimCanvas.onmousedown = (e) => {
  const p = trimMousePos(e);
  const h = trimHandles().find(h => Math.abs(h.x - p.x) < 14 && Math.abs(h.y - p.y) < 14);
  const s = trimScale, r = trimRect;
  if (h) dragMode = h.m;
  else if (p.x > r.x * s && p.x < (r.x + r.w) * s && p.y > r.y * s && p.y < (r.y + r.h) * s) dragMode = 'move';
  else return;
  dragStart = p;
  rectStart = { ...trimRect };
  e.preventDefault();
};

window.addEventListener('mousemove', (e) => {
  if (!dragMode) return;
  const p = trimMousePos(e);
  const dx = (p.x - dragStart.x) / trimScale;
  const dy = (p.y - dragStart.y) / trimScale;
  let { x, y, w, h } = rectStart;
  if (dragMode === 'move') { x += dx; y += dy; }
  else {
    if (dragMode.includes('w')) { x += dx; w -= dx; }
    if (dragMode.includes('e')) { w += dx; }
    if (dragMode.includes('n')) { y += dy; h -= dy; }
    if (dragMode.includes('s')) { h += dy; }
  }
  w = Math.max(50, w); h = Math.max(50, h);
  x = Math.max(0, Math.min(x, trimImg.width - w));
  y = Math.max(0, Math.min(y, trimImg.height - h));
  w = Math.min(w, trimImg.width - x);
  h = Math.min(h, trimImg.height - y);
  trimRect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  drawTrim();
});
window.addEventListener('mouseup', () => { dragMode = null; });

document.getElementById('trimApply').onclick = () => {
  if (trimCard && trimImg) {
    pushUndo();
    trimCard._manualRect = { ...trimRect };
    drawCard(trimCard, trimImg, cropEnabled);
  }
  trimModal.style.display = 'none';
};
document.getElementById('trimReset').onclick = () => {
  if (trimCard && trimImg) {
    pushUndo();
    delete trimCard._manualRect;
    drawCard(trimCard, trimImg, cropEnabled);
  }
  trimModal.style.display = 'none';
};
document.getElementById('trimCancel').onclick = () => { trimModal.style.display = 'none'; };

// 編集中ページで動かした「各辺の調整量」を、選択中の全ページの枠にも相対適用する。
// 同じ絶対座標を使うと左右ページ（見開きの半分ずつ）で枠がズレるため、
// 各ページ自身の現在枠を基準に同じだけ辺を動かす
document.getElementById('trimApplySel').onclick = async () => {
  if (!trimCard || !trimImg) { trimModal.style.display = 'none'; return; }
  pushUndo();
  const d = {
    l: trimRect.x - trimBaseRect.x,
    t: trimRect.y - trimBaseRect.y,
    r: (trimRect.x + trimRect.w) - (trimBaseRect.x + trimBaseRect.w),
    b: (trimRect.y + trimRect.h) - (trimBaseRect.y + trimBaseRect.h)
  };
  const targets = new Set(container.querySelectorAll('.page-card.selected'));
  targets.add(trimCard);
  const img = new Image();
  let count = 0;
  for (const card of targets) {
    if (card === trimCard) {
      card._manualRect = { ...trimRect };
      drawCard(card, trimImg, cropEnabled);
      count++;
      continue;
    }
    img.src = rawImages[card._imgIdx];
    try { await img.decode(); } catch (e) { continue; }
    const r0 = card._manualRect || (cropEnabled ? card._cropRect : card._bandRect);
    let x0 = r0.x + d.l, y0 = r0.y + d.t;
    let x1 = r0.x + r0.w + d.r, y1 = r0.y + r0.h + d.b;
    x0 = Math.max(0, Math.min(x0, img.width - 50));
    y0 = Math.max(0, Math.min(y0, img.height - 50));
    x1 = Math.min(img.width, Math.max(x1, x0 + 50));
    y1 = Math.min(img.height, Math.max(y1, y0 + 50));
    card._manualRect = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    drawCard(card, img, cropEnabled);
    count++;
  }
  info.innerText = count + "ページにトリミングを適用しました";
  trimModal.style.display = 'none';
};

// ツールバーの「トリミング」ボタン: フォーカス中（無ければ選択中の先頭）ページで編集を開く
document.getElementById('trimBtn').onclick = () => {
  const target = container.querySelector('.page-card.focused')
    || container.querySelector('.page-card.selected')
    || container.children[0];
  if (target) openTrimEditor(target);
  else alert("ページがありません");
};

// ===== 保存フロー =====
// タイトルは撮影時にKindleのページ情報から取得済み（bookConfig.title）。手修正可能。
document.getElementById('saveBtn').onclick = () => {
  if (!container.children.length) { alert("ページがありません"); return; }
  const modal = document.getElementById('aiModal');
  document.getElementById('coverPreview').src = firstBase64;
  const titleInput = document.getElementById('aiTitle');
  titleInput.value = bookConfig.title || '';
  document.getElementById('aiAuthor').value = bookConfig.author || '';
  modal.style.display = 'flex';
  titleInput.focus();
  titleInput.select();
};

document.getElementById('aiConfirmBtn').onclick = async () => {
  const title = document.getElementById('aiTitle').value.trim() || "Book";
  const author = document.getElementById('aiAuthor').value.trim(); // 空なら書籍名のみ
  document.getElementById('aiModal').style.display = 'none';

  const cvs = container.querySelectorAll('canvas');
  if (!cvs.length) { alert("ページがありません"); return; }
  if (!jsPDF) { alert("jsPDFが読み込めていないためPDF保存できません"); return; }

  pWrap.style.display = 'block';
  let pdf = null;
  for (let i = 0; i < cvs.length; i++) {
    const c = cvs[i];
    const orient = c.width > c.height ? 'l' : 'p';
    if (!pdf) pdf = new jsPDF({ orientation: orient, unit: 'px', format: [c.width, c.height] });
    else pdf.addPage([c.width, c.height], orient);
    pdf.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, c.width, c.height);
    pBar.style.width = Math.round(((i + 1) / cvs.length) * 100) + '%';
    await new Promise(r => setTimeout(r, 10));
  }
  const base = author ? `${author}_${title}` : title; // 著者名なしなら「書籍名.pdf」
  const fname = base.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) + ".pdf";
  pdf.save(fname);
  pWrap.style.display = 'none';
  pBar.style.width = '0%';
};
