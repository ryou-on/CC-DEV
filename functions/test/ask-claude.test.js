/**
 * askClaude の純粋関数テスト（API・Firestore には接続しない）
 * 実行: cd functions && npm test
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'cc-dev-ps7';
const { __test__: t } = require('../ask-claude');

test('convert: 空・上限超過を拒否し、上限内は通す', () => {
  assert.equal(t.validateInput('convert', { text: '  ' }).ok, false);
  assert.equal(t.validateInput('convert', { text: 'あ'.repeat(6001) }).ok, false);
  const v = t.validateInput('convert', { text: '# タイトル\n### CUT 1' });
  assert.equal(v.ok, true);
  assert.match(v.user, /CUT 1/);
});

test('rough: 文字数上限・必須項目・viewBox', () => {
  assert.equal(t.validateInput('rough', { action: 'あ'.repeat(2001) }).ok, false);
  assert.equal(t.validateInput('rough', { action: '', dialogue: '' }).ok, false);
  const v = t.validateInput('rough', { action: '教室', aspect: '9:16' });
  assert.equal(v.ok, true);
  assert.match(v.variable, /0 0 720 1280/);
});

test('不明なタスク・不正な入力型を拒否', () => {
  assert.equal(t.validateInput('opusFree', { text: 'x' }).ok, false);
  assert.equal(t.validateInput('convert', null).ok, false);
  assert.equal(t.validateInput('rough', { action: 123, dialogue: ['x'] }).ok, false);
});

test('buildParams: 固定部分にだけ cache_control、可変部分は後ろ', () => {
  const p = t.buildParams('rough', t.validateInput('rough', { action: '教室', title: 'テスト' }));
  assert.equal(p.model, 'claude-sonnet-5-5');
  assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(p.system[1].cache_control, undefined);
  assert.match(p.system[1].text, /テスト/);
  assert.deepEqual(p.thinking, { type: 'between_tools' });
  assert.equal(t.buildParams('roughLite', t.validateInput('roughLite', { action: 'x' })).model, 'claude-haiku-5-5');
});

test('calcCost: モデル単価・キャッシュ・バッチ半額', () => {
  const u = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
  assert.equal(t.calcCost('claude-sonnet-5-5', u), 12);
  assert.equal(t.calcCost('claude-sonnet-5-5', u, { batch: true }), 6);
  assert.equal(t.calcCost('claude-haiku-5-5', { cache_read_input_tokens: 1_000_000 }), 0.01);
  assert.equal(t.calcCost('unknown', u), 0);
});

test('userMessage: 内部詳細を出さず日本語で返す', () => {
  assert.match(t.userMessage({ status: 429 }), /集中/);
  assert.match(t.userMessage({ status: 529 }), /混雑/);
  assert.match(t.userMessage({ status: 400, error: { error: { message: 'Your credit balance is too low' } } }), /残高/);
  assert.doesNotMatch(t.userMessage({ status: 500, message: 'sk-ant-secret' }), /sk-ant/);
});

test('dateJst / hashUid', () => {
  assert.equal(t.dateJst(Date.UTC(2026, 10, 14, 15, 30)), '2026-11-15'); // UTC 15:30 = JST 翌0:30
  assert.equal(t.hashUid('abc').length, 16);
  assert.notEqual(t.hashUid('abc'), 'abc');
});
