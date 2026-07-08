#!/usr/bin/env node
// firestore.rules を Firebase Rules API (REST) でデプロイする
// firebase CLI がハングする環境向けのフォールバック
// 実行: node deploy-rules-rest.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT = 'cc-dev-ps7';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken() {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token', refresh_token: cfg.tokens.refresh_token,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('トークン交換失敗: ' + JSON.stringify(j));
  return j.access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${url}`, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const token = await getAccessToken();

  // 1. ルールセット作成
  const ruleset = await api(token, 'POST', `projects/${PROJECT}/rulesets`, {
    source: { files: [{ name: 'firestore.rules', content: rules }] },
  });
  console.log('✅ ruleset 作成:', ruleset.name);

  // 2. cloud.firestore リリースを新ルールセットへ更新
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  const release = await api(token, 'PATCH', releaseName, {
    release: { name: releaseName, rulesetName: ruleset.name },
  });
  console.log('✅ release 更新:', release.name, '→', release.rulesetName);
  console.log('🎉 firestore.rules デプロイ完了');
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
