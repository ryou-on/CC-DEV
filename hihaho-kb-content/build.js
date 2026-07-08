#!/usr/bin/env node
// hihaho-kb-content ビルドスクリプト
// 1. support/ service/ の markdown → public/hihaho-kb/kb-data.json（公開記事のみ）
// 2. internal/ の markdown → internal-data.json（Firestoreシード/管理画面インポート用・非公開）
// 3. Obsidian Vault (wiki/hihaho-kb/) へ全ノートをコピーし INDEX ノートを生成
//
// 実行: node build.js          … JSON生成のみ
//       node build.js --vault  … JSON生成 + Vault同期

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const REPO = path.dirname(ROOT);
const VAULT = path.join(
  os.homedir(),
  'Library/CloudStorage/GoogleDrive-jumpei.omote@splineglobal.com/マイドライブ/Obsidian/My ファースト Obsidian'
);
const VAULT_KB = path.join(VAULT, 'wiki', 'hihaho-kb');

// --- frontmatter パーサ（依存ゼロの簡易実装） ---
function parseNote(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }
    meta[kv[1]] = v;
  }
  return { meta, body: m[2].trim(), file: filePath };
}

// Web(JSON)用: Obsidian専用の「## 関連トピック」節（wikilink）を本文から除去
function stripRelated(body) {
  return body.replace(/\n+##\s*関連トピック[\s\S]*$/, '').trim();
}

function walkMd(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function collect(dirs) {
  const articles = [];
  for (const dir of dirs) {
    for (const f of walkMd(path.join(ROOT, dir))) {
      const n = parseNote(f);
      if (!n) { console.warn('  ⚠ frontmatterなしをスキップ:', f); continue; }
      articles.push({
        id: String(n.meta.id || path.basename(f, '.md')),
        slug: n.meta.slug || '',
        title: n.meta.title || path.basename(f, '.md'),
        title_en: n.meta.title_en || '',
        category: n.meta.category || dir,
        category_ja: n.meta.category_ja || dir,
        audience: n.meta.audience || 'public',
        source: n.meta.source || '',
        summary: n.meta.summary || '',
        tags: Array.isArray(n.meta.tags) ? n.meta.tags : [],
        updated: n.meta.translated || n.meta.created || '',
        body: n.body,
        _file: f,
      });
    }
  }
  return articles;
}

// --- 1. 公開JSON ---
const pub = collect(['support', 'service']).filter(a => a.audience === 'public');
const pubOut = {
  generated: new Date().toISOString(),
  count: pub.length,
  articles: pub.map(({ _file, ...a }) => ({ ...a, body: stripRelated(a.body) })),
};
const pubPath = path.join(REPO, 'public', 'hihaho-kb', 'kb-data.json');
fs.mkdirSync(path.dirname(pubPath), { recursive: true });
fs.writeFileSync(pubPath, JSON.stringify(pubOut, null, 1));
console.log(`✅ 公開記事 ${pub.length}件 → ${pubPath}`);

// --- 2. 社内JSON（public/ 配下には絶対に出力しない） ---
const internal = collect(['internal']);
const intOut = {
  generated: new Date().toISOString(),
  count: internal.length,
  articles: internal.map(({ _file, ...a }) => ({ ...a, audience: 'internal', body: stripRelated(a.body) })),
};
const intPath = path.join(ROOT, 'internal-data.json');
fs.writeFileSync(intPath, JSON.stringify(intOut, null, 1));
console.log(`✅ 社内記事 ${internal.length}件 → ${intPath}`);

// --- 3. Vault 同期 ---
if (process.argv.includes('--vault')) {
  if (!fs.existsSync(VAULT)) {
    console.error('❌ Vaultが見つかりません:', VAULT);
    process.exit(1);
  }
  const all = [...collect(['support', 'service']), ...internal];
  let copied = 0;
  for (const a of all) {
    const rel = path.relative(ROOT, a._file); // support/faq/xxx.md
    const dest = path.join(VAULT_KB, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(a._file, dest);
    copied++;
  }
  // INDEX ノート生成（カテゴリ別に wikilink 一覧）
  const byCat = {};
  for (const a of all) (byCat[a.category_ja] = byCat[a.category_ja] || []).push(a);
  const lines = [
    '# hihahoナレッジベース INDEX',
    '',
    `- **作成日**: ${new Date().toISOString().slice(0, 10)}`,
    '- **タグ**: #hihaho #ナレッジベース',
    '',
    '## 概要',
    `hihaho公式サポートKB（support.hihaho.com）の日本語全訳、サービス資料5.0、営業完全ガイド（社内）を統合したナレッジベース。全${all.length}ノート。`,
    'Webアプリ版: 公開KB https://cc-dev-ps7.web.app/hihaho-kb/ ／ 社内KB https://cc-dev-ps7.web.app/hihaho-kb-internal/ ／ 管理画面 https://cc-dev-ps7.web.app/hihaho-kb-admin/',
    '',
  ];
  for (const cat of Object.keys(byCat).sort()) {
    const isInternal = byCat[cat][0].audience === 'internal';
    lines.push(`## ${cat}${isInternal ? '（社内限定）' : ''}`);
    for (const a of byCat[cat].sort((x, y) => x.title.localeCompare(y.title, 'ja'))) {
      lines.push(`- [[${path.basename(a._file, '.md')}]] — ${a.summary}`);
    }
    lines.push('');
  }
  lines.push('## 関連トピック', '- [[hihaho（インタラクティブ動画SaaS）]]', '- [[hihaho営業ガイド]]', '- [[hihaho運用・統計サポート]]', '');
  fs.writeFileSync(path.join(VAULT_KB, 'hihahoナレッジベース INDEX.md'), lines.join('\n'));
  console.log(`✅ Vault同期 ${copied}ノート + INDEX → ${VAULT_KB}`);
}
