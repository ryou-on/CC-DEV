#!/usr/bin/env node
/**
 * cost-guard-check.js — 「放置した公開サイトがボットに叩かれて高額請求」を防ぐ静的チェック
 *
 * 実行: node scripts/cost-guard-check.js
 *   - エラー（❌）が1つでもあれば exit 1（CI / pre-push をブロック）
 *   - 警告（⚠️）は表示のみ
 *
 * チェック内容:
 *   E1. 各 Hosting サイトに robots.txt があり、AIクローラー（GPTBot / ClaudeBot）を拒否している
 *   E2. functions/index.js の setGlobalOptions に maxInstances（スケール上限）がある
 *   E3. 有料API（OpenAI / Anthropic / Meshy 等）を呼ぶ onRequest 関数に
 *       costGuard.guardPaidRequest か Firebase Auth（verifyIdToken）等のガードがある
 *   E4. public/ と functions/ に秘密鍵・APIキーがハードコードされていない
 *   E5. public/ に 10MB を超えるファイルがない（3MB超は警告）
 *   W6. Firestore ルールの「誰でも書き込み可（if true）」を警告
 *   W7. 1MB を超える HTML を警告
 *
 * 例外を認める場合は、該当関数内に `// cost-guard: ok <理由>` と書く（レビューで理由を確認すること）。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// git 管理下のファイルだけを対象にする（ローカルの録音wav等の未追跡ファイルは無視）
function trackedFiles() {
  try {
    return execSync('git ls-files -z', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean);
  } catch {
    return [];
  }
}
const files = trackedFiles();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const sizeOf = (rel) => { try { return fs.statSync(path.join(ROOT, rel)).size; } catch { return 0; } };
const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';

// ---------------------------------------------------------------------------
// E1. robots.txt
// ---------------------------------------------------------------------------
function robotsBlocksAll(txt) {
  // User-agent: * の直後のグループに Disallow: / があれば全面拒否
  return /User-agent:\s*\*\s*(?:\r?\n(?!User-agent)[^\n]*)*\r?\nDisallow:\s*\/\s*(\r?\n|$)/i.test(txt);
}
function robotsBlocksBot(txt, bot) {
  // 指定ボットを含む User-agent グループに Disallow: / がある
  const groups = txt.split(/\r?\n\s*\r?\n/);
  return groups.some((g) => new RegExp(`^User-agent:\\s*${bot}\\s*$`, 'im').test(g) && /^Disallow:\s*\/\s*$/im.test(g));
}

const firebaseJson = JSON.parse(read('firebase.json'));
const hostings = [].concat(firebaseJson.hosting || []);
for (const h of hostings) {
  const robotsPath = path.posix.join(h.public, 'robots.txt');
  if (!exists(robotsPath)) {
    err(`E1 ${robotsPath} がありません（Hosting target "${h.target}"）。AIクローラーを拒否する robots.txt を置いてください`);
    continue;
  }
  const txt = read(robotsPath);
  if (robotsBlocksAll(txt)) continue;
  for (const bot of ['GPTBot', 'ClaudeBot']) {
    if (!robotsBlocksBot(txt, bot)) err(`E1 ${robotsPath} が ${bot} を拒否していません（User-agent: ${bot} / Disallow: /）`);
  }
}

// ---------------------------------------------------------------------------
// E2. maxInstances
// ---------------------------------------------------------------------------
if (exists('functions/index.js')) {
  const idx = read('functions/index.js');
  const m = idx.match(/setGlobalOptions\(\{([^}]*)\}\)/);
  if (!m || !/maxInstances\s*:/.test(m[1])) {
    err('E2 functions/index.js の setGlobalOptions に maxInstances がありません（無制限スケール＝課金暴走の原因）');
  }
}

// ---------------------------------------------------------------------------
// E3. 有料APIを呼ぶ公開関数のガード
// ---------------------------------------------------------------------------
const PAID_RE = /api\.openai\.com|api\.anthropic\.com|new Anthropic\(|generativelanguage\.googleapis|api\.meshy\.ai|api\.replicate\.com|api\.elevenlabs\.io|activeProvider\(\)|openaiApiKey\.value\(\)|anthropicApiKey\.value\(\)/;
const GUARD_RE = /costGuard\.guardPaidRequest|verifyIdToken|consumeGenerateQuota|\/\/\s*cost-guard:\s*ok/;

for (const rel of files.filter((f) => /^functions\/[^/]+\.js$/.test(f))) {
  const src = read(rel);
  const re = /^exports\.(\w+)\s*=\s*onRequest\(/gm;
  const starts = [];
  let m;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => {
    const chunk = src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length);
    if (PAID_RE.test(chunk) && !GUARD_RE.test(chunk)) {
      err(`E3 ${rel}: ${s.name} は有料APIを呼んでいるのにガードがありません（costGuard.guardPaidRequest か verifyIdToken を通すこと）`);
    }
  });
}

// ---------------------------------------------------------------------------
// E4. 秘密情報のハードコード
// ---------------------------------------------------------------------------
const SECRET_RE = /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{48}\b|\b[sr]k_live_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN (?:RSA )?PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{36}/;
for (const rel of files.filter((f) => /^(public|functions)\//.test(f) && /\.(html?|m?js|cjs|ts|tsx|jsx|json|txt|md|env)$/i.test(f))) {
  if (rel.includes('node_modules/')) continue;
  if (sizeOf(rel) > 5 * 1024 * 1024) continue;
  const hit = read(rel).match(SECRET_RE);
  if (hit) err(`E4 ${rel}: 秘密鍵/APIキーらしき文字列（${hit[0].slice(0, 12)}…）。Secret Manager か Worker の環境変数へ移すこと`);
}

// ---------------------------------------------------------------------------
// E5 / W7. ファイルサイズ
// ---------------------------------------------------------------------------
for (const rel of files.filter((f) => f.startsWith('public/'))) {
  const size = sizeOf(rel);
  if (size > 10 * 1024 * 1024) err(`E5 ${rel} が ${mb(size)}（10MB超）。Storage + CDN キャッシュ配信か、分割・圧縮を検討`);
  else if (size > 3 * 1024 * 1024) warn(`W5 ${rel} が ${mb(size)}（3MB超）。初回表示で読み込まないこと（遅延読込）`);
  if (/\.html?$/i.test(rel) && size > 1024 * 1024) warn(`W7 ${rel} が ${mb(size)} の HTML。埋め込みデータの外出しを検討`);
}

// ---------------------------------------------------------------------------
// W6. Firestore の誰でも書き込み
// ---------------------------------------------------------------------------
if (exists('firestore.rules')) {
  const lines = read('firestore.rules').split('\n');
  let current = '';
  lines.forEach((line, i) => {
    const mm = line.match(/match\s+(\/\S+)/);
    if (mm) current = mm[1];
    if (/allow\s+[^:;]*\b(write|create|update)\b[^:;]*:\s*if\s+true\s*;/.test(line)) {
      warn(`W6 firestore.rules:${i + 1} ${current} が誰でも書き込み可（大量書き込みで課金・データ汚染の恐れ）`);
    }
  });
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
console.log('💸 cost-guard-check');
for (const w of warnings) console.log('⚠️  ' + w);
for (const e of errors) console.log('❌ ' + e);
if (errors.length) {
  console.log(`\n🚫 ${errors.length} 件のエラー。docs/cost-guard.md の対策を適用してください。`);
  process.exit(1);
}
console.log(`✅ エラーなし（警告 ${warnings.length} 件）`);
