// AI使用率コレクター: Claude Code / Codex / ChatGPT（手動）をローカルログから集計する
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = process.env.HOME || os.homedir();
const DATA_DIR = process.env.AI_USAGE_DIR || path.join(HOME, '.ai-usage');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CHATGPT_FILE = path.join(DATA_DIR, 'chatgpt.json');
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CODEX_DIR = process.env.CODEX_HOME || path.join(HOME, '.codex');
const H = 3600 * 1000;

// ---------- 設定 ----------
export function loadConfig() {
  const def = {
    // 0 または未指定 = 過去最大値を上限とみなす（ccusage 方式）
    claudeBlockLimitTokens: 0, // 5時間ブロックのトークン上限
    claudeWeekLimitTokens: 0, // 7日間のトークン上限
  };
  try { return { ...def, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { return def; }
}

function walk(dir, ext, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// ---------- Claude Code ----------
const fileCache = new Map(); // path -> {sig, entries}

function parseClaudeFile(file) {
  const st = fs.statSync(file);
  const sig = `${st.mtimeMs}:${st.size}`;
  const c = fileCache.get(file);
  if (c && c.sig === sig) return c.entries;
  const entries = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const j = JSON.parse(line);
      const u = j.message?.usage;
      if (!u || !j.timestamp) continue;
      const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
      entries.push({ t: Date.parse(j.timestamp), tokens, key: `${j.message.id || ''}:${j.requestId || ''}` });
    } catch { /* 壊れた行は無視 */ }
  }
  fileCache.set(file, { sig, entries });
  return entries;
}

// 5時間ブロックを作る（開始は時刻の切り捨て、ギャップ>5hで新ブロック）
function buildBlocks(entries) {
  const blocks = [];
  let cur = null;
  for (const e of entries) {
    if (!cur || e.t >= cur.end || e.t - cur.last >= 5 * H) {
      const start = Math.floor(e.t / H) * H;
      cur = { start, end: start + 5 * H, last: e.t, tokens: 0 };
      blocks.push(cur);
    }
    cur.tokens += e.tokens;
    cur.last = e.t;
  }
  return blocks;
}

export function collectClaude(cfg, now = Date.now()) {
  const files = walk(path.join(CLAUDE_DIR, 'projects'), '.jsonl');
  if (!files.length) return { id: 'claude', name: 'Claude Code', status: 'nodata', windows: [] };
  const seen = new Set();
  const all = [];
  for (const f of files) {
    for (const e of parseClaudeFile(f)) {
      if (e.key !== ':' && seen.has(e.key)) continue;
      seen.add(e.key);
      all.push(e);
    }
  }
  all.sort((a, b) => a.t - b.t);
  const blocks = buildBlocks(all);
  const active = blocks.find((b) => now < b.end && now - b.last < 5 * H);
  const blockMax = Math.max(1, ...blocks.map((b) => b.tokens));
  const blockLimit = cfg.claudeBlockLimitTokens || blockMax;

  // 7日ローリング
  const weekTokens = all.filter((e) => e.t > now - 7 * 24 * H).reduce((s, e) => s + e.tokens, 0);
  // 過去の各日を終点とする7日合計の最大値を上限とする
  let weekMax = weekTokens;
  for (let d = 1; d <= 60; d++) {
    const end = now - d * 24 * H;
    const s = all.filter((e) => e.t > end - 7 * 24 * H && e.t <= end).reduce((a, e) => a + e.tokens, 0);
    if (s > weekMax) weekMax = s;
  }
  const weekLimit = cfg.claudeWeekLimitTokens || Math.max(1, weekMax);

  const windows = [
    {
      label: '5時間',
      percent: active ? Math.min(100, (active.tokens / blockLimit) * 100) : 0,
      detail: `${fmt(active?.tokens || 0)} / ${fmt(blockLimit)} tok`,
      resetsAt: active ? active.end : null,
    },
    {
      label: '7日間',
      percent: Math.min(100, (weekTokens / weekLimit) * 100),
      detail: `${fmt(weekTokens)} / ${fmt(weekLimit)} tok`,
      resetsAt: null,
    },
  ];
  return { id: 'claude', name: 'Claude Code', status: 'ok', windows };
}

// ---------- Codex ----------
// セッションログ末尾の token_count イベントから rate_limits（used_percent）を読む
function lastLines(file, bytes = 400 * 1024) {
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  const len = Math.min(bytes, st.size);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, st.size - len);
  fs.closeSync(fd);
  return buf.toString('utf8').split('\n').reverse();
}

export function collectCodex(now = Date.now()) {
  const files = walk(path.join(CODEX_DIR, 'sessions'), '.jsonl')
    .map((f) => ({ f, m: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 8);
  if (!files.length) return { id: 'codex', name: 'Codex', status: 'nodata', windows: [] };
  for (const { f } of files) {
    for (const line of lastLines(f)) {
      if (!line.includes('rate_limits')) continue;
      try {
        const j = JSON.parse(line);
        const rl = j.payload?.rate_limits;
        if (!rl || (!rl.primary && !rl.secondary)) continue;
        const ts = Date.parse(j.timestamp) || now;
        const mk = (w, fallback) => {
          if (!w) return null;
          const resetsAt = w.resets_at ? w.resets_at * 1000 : w.resets_in_seconds != null ? ts + w.resets_in_seconds * 1000 : null;
          const expired = resetsAt && resetsAt < now; // リセット済みなら0%扱い
          const mins = w.window_minutes || fallback;
          return {
            label: mins >= 1440 ? `${Math.round(mins / 1440)}日間` : `${Math.round(mins / 60)}時間`,
            percent: expired ? 0 : Math.min(100, w.used_percent || 0),
            detail: expired ? 'リセット済み' : `${(w.used_percent || 0).toFixed(0)}% 使用`,
            resetsAt: expired ? null : resetsAt,
          };
        };
        const windows = [mk(rl.primary, 300), mk(rl.secondary, 10080)].filter(Boolean);
        return { id: 'codex', name: 'Codex', status: 'ok', windows, updatedAt: ts };
      } catch { /* 次の行へ */ }
    }
  }
  return { id: 'codex', name: 'Codex', status: 'nodata', windows: [] };
}

// ---------- ChatGPT（公式APIなし → 手動カウンター） ----------
export function readChatgpt() {
  try { return JSON.parse(fs.readFileSync(CHATGPT_FILE, 'utf8')); } catch { return { used: 0, limit: 80, windowHours: 3, resetsAt: null }; }
}
export function writeChatgpt(patch) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const cur = readChatgpt();
  let next = { ...cur, ...patch };
  if (patch.increment) {
    // ウィンドウ切れなら新しく開始
    if (!next.resetsAt || next.resetsAt < Date.now()) { next.used = 0; next.resetsAt = Date.now() + next.windowHours * H; }
    next.used += patch.increment;
    delete next.increment;
  }
  fs.writeFileSync(CHATGPT_FILE, JSON.stringify(next, null, 2));
  return next;
}
export function collectChatgpt(now = Date.now()) {
  const c = readChatgpt();
  const expired = c.resetsAt && c.resetsAt < now;
  const used = expired ? 0 : c.used;
  return {
    id: 'chatgpt', name: 'ChatGPT', status: 'manual',
    windows: [{
      label: `${c.windowHours}時間`,
      percent: Math.min(100, (used / (c.limit || 1)) * 100),
      detail: `${used} / ${c.limit} msg（手動）`,
      resetsAt: expired ? null : c.resetsAt,
    }],
  };
}

function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n); }

export function collectAll() {
  const cfg = loadConfig();
  const safe = (fn, id, name) => { try { return fn(); } catch (e) { return { id, name, status: 'error', error: String(e.message), windows: [] }; } };
  return {
    generatedAt: Date.now(),
    services: [
      safe(() => collectClaude(cfg), 'claude', 'Claude Code'),
      safe(() => collectCodex(), 'codex', 'Codex'),
      safe(() => collectChatgpt(), 'chatgpt', 'ChatGPT'),
    ],
  };
}
