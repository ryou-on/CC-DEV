'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hold = require('../../public/shared/fst-client-hold');

test('the client waits out the server retry window', () => {
  const map = {};
  const now = 1_000_000;
  assert.equal(hold.holding(map, 'analytics', now), false);
  hold.holdUntil(map, 'analytics', now, 90);
  assert.equal(hold.holding(map, 'analytics', now + 89_000), true);
  assert.equal(hold.holding(map, 'analytics', now + 90_000), false);
});

test('a crowded survey answer keeps a fixed message', () => {
  assert.equal(hold.crowdedAnswerMessage(429), '混み合っています。少し待ってもう一度送ってください');
  assert.equal(hold.crowdedAnswerMessage(500), '');
});

test('a dropped analytics event is warned and not silent', () => {
  const lines = [];
  assert.equal(hold.warnDroppedAnalytics(201, line => lines.push(line)), false);
  assert.equal(hold.warnDroppedAnalytics(429, line => lines.push(line)), true);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /混み合ったときは統計が実際より少なく出ることがある/);
});

test('the survey popup shows the crowded message and does not clear the answer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/Flight_Strip_TODO_dev/index.html'), 'utf8');
  const start = html.indexOf('const handleSubmit = async');
  const end = html.indexOf('return (', start);
  const fn = html.slice(start, end);
  assert.match(fn, /混み合っています。少し待ってもう一度送ってください/);
  assert.equal(fn.includes('setText('), false);
  assert.equal(fn.includes('setSelected('), false);
  assert.match(html, /warnDroppedAnalytics\(res\.status\)/);
  const stable = fs.readFileSync(path.join(__dirname, '../../public/Flight_Strip_TODO/index.html'), 'utf8');
  assert.match(stable, /warnDroppedAnalytics\(res\.status\)/);
});
