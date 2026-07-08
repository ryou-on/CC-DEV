#!/usr/bin/env node
// internal-data.json を Firestore の hihaho-kb コレクションへ投入する
// 認証: firebase-tools のログイン済みリフレッシュトークンを利用（オーナー権限・rulesの制約を受けない）
// 実行: node build.js && node seed-firestore.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT = 'cc-dev-ps7';
// firebase-tools CLI の公開OAuthクライアント（google公式にCLIへ埋め込まれている値）
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken() {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  const refresh = cfg.tokens && cfg.tokens.refresh_token;
  if (!refresh) throw new Error('firebase login が必要です（refresh_token なし）');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token', refresh_token: refresh,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('トークン交換失敗: ' + JSON.stringify(j));
  return j.access_token;
}

// JS値 → Firestore REST の Value 形式
function toValue(v) {
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'internal-data.json'), 'utf8'));
  const token = await getAccessToken();
  let ok = 0, ng = 0;
  for (const a of data.articles) {
    const docId = String(a.id).replace(/[^\w-]/g, '_');
    const fields = {
      title: toValue(a.title),
      title_en: toValue(a.title_en || ''),
      category_ja: toValue(a.category_ja || '営業ガイド（社内）'),
      audience: toValue('internal'),
      tags: toValue(a.tags || []),
      summary: toValue(a.summary || ''),
      source: toValue(a.source || ''),
      body: toValue(a.body || ''),
      updatedAt: { timestampValue: new Date().toISOString() },
      updatedBy: toValue('seed-script'),
    };
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/hihaho-kb/${encodeURIComponent(docId)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (res.ok) { ok++; console.log('✅', docId, a.title); }
    else { ng++; console.error('❌', docId, res.status, await res.text()); }
  }
  console.log(`\n完了: 成功${ok}件 / 失敗${ng}件`);
  if (ng) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
