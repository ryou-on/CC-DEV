// cost-guard の単体テスト（Firestore はスタブ。ネットワーク不要）
const test = require('node:test');
const assert = require('node:assert');
const costGuard = require('../cost-guard');

// Firestore スタブ: cost-guard/config の killSwitch だけ返す
let killSwitch = false;
costGuard.__setDbForTest(() => ({
  doc: () => ({ get: async () => ({ exists: true, data: () => ({ killSwitch }) }) }),
}));

function mockReq(headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (k) => h[k.toLowerCase()], ip: '127.0.0.1' };
}
function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

test('AIクローラーを検出する', () => {
  for (const ua of [
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'CCBot/2.0 (https://commoncrawl.org/faq/)',
    'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
  ]) {
    assert.ok(costGuard.isAiCrawler(mockReq({ 'user-agent': ua })), ua);
    assert.ok(costGuard.isBotRequest(mockReq({ 'user-agent': ua })), ua);
  }
});

test('通常ブラウザとリンクプレビューは素材配信で弾かない', () => {
  assert.ok(!costGuard.isAiCrawler(mockReq({ 'user-agent': BROWSER })));
  assert.ok(!costGuard.isAiCrawler(mockReq({ 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' })));
  assert.ok(!costGuard.isAiCrawler(mockReq({})));
});

test('有料APIの入口では UA 無し・curl・スクリプトも弾く', () => {
  assert.ok(costGuard.isBotRequest(mockReq({})));
  assert.ok(costGuard.isBotRequest(mockReq({ 'user-agent': 'curl/8.4.0' })));
  assert.ok(costGuard.isBotRequest(mockReq({ 'user-agent': 'python-requests/2.31' })));
  assert.ok(!costGuard.isBotRequest(mockReq({ 'user-agent': BROWSER })));
});

test('Origin 検査は自サイトのみ通す', () => {
  assert.ok(costGuard.originAllowedStrict(mockReq({ origin: 'https://cc-dev-ps7.web.app' })));
  assert.ok(!costGuard.originAllowedStrict(mockReq({ origin: 'https://evil.example' })));
  assert.ok(!costGuard.originAllowedStrict(mockReq({})));
});

test('guardPaidRequest: ボットは 403', async () => {
  const res = mockRes();
  const ok = await costGuard.guardPaidRequest(mockReq({ 'user-agent': 'GPTBot/1.2', origin: 'https://cc-dev-ps7.web.app' }), res);
  assert.strictEqual(ok, false);
  assert.strictEqual(res.statusCode, 403);
});

test('guardPaidRequest: 他サイトからは 403', async () => {
  const res = mockRes();
  const ok = await costGuard.guardPaidRequest(mockReq({ 'user-agent': BROWSER, origin: 'https://evil.example' }), res);
  assert.strictEqual(ok, false);
  assert.strictEqual(res.statusCode, 403);
});

test('guardPaidRequest: キルスイッチ ON なら 503、OFF なら通過', async () => {
  const req = mockReq({ 'user-agent': BROWSER, origin: 'https://cc-dev-ps7.web.app' });

  killSwitch = true;
  costGuard.__resetCacheForTest();
  let res = mockRes();
  assert.strictEqual(await costGuard.guardPaidRequest(req, res), false);
  assert.strictEqual(res.statusCode, 503);

  killSwitch = false;
  costGuard.__resetCacheForTest();
  res = mockRes();
  assert.strictEqual(await costGuard.guardPaidRequest(req, res), true);
});
