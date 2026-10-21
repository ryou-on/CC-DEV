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
  assert.equal(hold.crowdedAnswerMessage(503, 'COST_GUARD_UNAVAILABLE'), '混み合っています。少し待ってもう一度送ってください');
  assert.equal(hold.crowdedAnswerMessage(503, 'SERVICE_PAUSED'), '');
  assert.equal(hold.crowdedAnswerMessage(500), '');
});

test('a dropped analytics event is warned and not silent', () => {
  const lines = [];
  assert.equal(hold.warnDroppedAnalytics(201, line => lines.push(line)), false);
  assert.equal(hold.warnDroppedAnalytics(429, line => lines.push(line)), true);
  assert.equal(hold.warnDroppedAnalytics(503, 'COST_GUARD_UNAVAILABLE', line => lines.push(line)), true);
  assert.equal(hold.warnDroppedAnalytics(503, 'SERVICE_PAUSED', line => lines.push(line)), false);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /混み合ったときは統計が実際より少なく出ることがある/);
  assert.match(lines[1], /混み合ったときは統計が実際より少なく出ることがある/);
});

function feedbackSubmit(html) {
  const start = html.indexOf('const FeedbackModal');
  const fnStart = html.indexOf('const handleSubmit = async', start);
  const fnEnd = html.indexOf('return (', fnStart);
  return html.slice(fnStart, fnEnd);
}

test('the survey popup shows the crowded message and does not clear the answer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/Flight_Strip_TODO_dev/index.html'), 'utf8');
  const start = html.lastIndexOf('const handleSubmit = async', html.indexOf('SURVEY'));
  const surveyStart = html.indexOf('const SurveyPopup');
  const fnStart = html.indexOf('const handleSubmit = async', surveyStart);
  const fnEnd = html.indexOf('return (', fnStart);
  const fn = html.slice(fnStart, fnEnd);
  assert.match(fn, /e\.status === 503 && e\.code === 'COST_GUARD_UNAVAILABLE'/);
  assert.match(fn, /混み合っています。少し待ってもう一度送ってください/);
  assert.equal(fn.includes('setText('), false);
  assert.equal(fn.includes('setSelected('), false);
  assert.match(html, /warnDroppedAnalytics\(res\.status, body\.error\)/);
  assert.match(html, /failed\.code = body\.error/);
  const stable = fs.readFileSync(path.join(__dirname, '../../public/Flight_Strip_TODO/index.html'), 'utf8');
  assert.match(stable, /warnDroppedAnalytics\(res\.status, body\.error\)/);
  assert.equal(start > 0 || surveyStart > 0, true);
});

test('a guard outage keeps the suggestion text and shows the crowded message', () => {
  const sentence = "COST_GUARD_UNAVAILABLE: '混み合っています。少し待ってもう一度送ってください'";
  for (const file of ['../../public/Flight_Strip_TODO_dev/index.html', '../../public/Flight_Strip_TODO/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.equal(html.includes(sentence), true, file);
    const fn = feedbackSubmit(html);
    assert.match(fn, /setError\(e\.message \|\| '送信に失敗しました'\)/);
    assert.equal(fn.includes('setSubject('), false);
    assert.equal(fn.includes('setMessage('), false);
    assert.equal(fn.includes("setSubject('')"), false);
    assert.equal(fn.includes("setMessage('')"), false);
  }
});
