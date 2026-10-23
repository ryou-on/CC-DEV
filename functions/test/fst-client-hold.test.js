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
  assert.equal(hold.holdRemaining(map, 'analytics', now + 30_000), 60);
});

test('the send button stays disabled for the retry window', () => {
  const now = 5_000_000;
  assert.equal(hold.retrySeconds(''), 60);
  assert.equal(hold.retrySeconds('0'), 60);
  assert.equal(hold.retrySeconds('45'), 45);
  const until = hold.pauseSend(now, 45);
  assert.equal(until, now + 45_000);
  assert.equal(hold.sendPaused(until, now + 44_000), true);
  assert.equal(hold.sendPaused(until, now + 45_000), false);
  const dev = fs.readFileSync(path.join(__dirname, '../../public/Flight_Strip_TODO_dev/index.html'), 'utf8');
  const stable = fs.readFileSync(path.join(__dirname, '../../public/Flight_Strip_TODO/index.html'), 'utf8');
  assert.match(dev, /disabled=\{window\.fstClientHold\.sendPaused\(sendPausedUntil, Date\.now\(\)\)\}/);
  assert.match(dev, /disabled=\{sending \|\| window\.fstClientHold\.sendPaused\(sendPausedUntil, Date\.now\(\)\)\}/);
  assert.match(stable, /disabled=\{sending \|\| window\.fstClientHold\.sendPaused\(sendPausedUntil, Date\.now\(\)\)\}/);
  for (const html of [dev, stable]) {
    assert.match(html, /res\.status === 429 \|\| res\.status === 503/);
    assert.match(html, /failed\.retryAfter = retryAfter/);
  }
});

test('the auth emulator is wired only for a localhost e2e flag', () => {
  for (const file of ['../../public/Flight_Strip_TODO_dev/index.html', '../../public/Flight_Strip_TODO/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.match(html, /__FST_E2E_EMULATOR === '1' && \(location\.hostname === 'localhost' \|\| location\.hostname === '127\.0\.0\.1'\)/);
    assert.match(html, /if \(window\.fstE2eEmulator\(\)\) \{\s*firebase\.auth\(\)\.useEmulator\('http:\/\/127\.0\.0\.1:9099'\)/);
    assert.equal(html.includes("useEmulator('https://"), false);
  }
});

test('the six flight strip functions run on one instance', () => {
  const names = ['fstFeedbackSubmit', 'updateFstFeedback', 'recordFstAnalytics', 'recordFstDevAdmin', 'recordFstSurvey', 'submitFstSurveyAnswer'];
  const files = {
    'fst-analytics.js': ['recordFstAnalytics'],
    'fst-feedback.js': ['fstFeedbackSubmit', 'updateFstFeedback'],
    'fst-dev-admin.js': ['recordFstDevAdmin', 'recordFstSurvey', 'submitFstSurveyAnswer'],
  };
  const seen = [];
  for (const [file, exports] of Object.entries(files)) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(src, /maxInstances:\s*1/);
    assert.equal(src.includes('maxInstances: 2'), false, file);
    for (const name of exports) {
      assert.match(src, new RegExp('exports\\.' + name + ' = '));
      seen.push(name);
    }
  }
  assert.deepEqual(seen.sort(), names.slice().sort());
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
  assert.equal(hold.warnDroppedAnalytics(503, undefined, line => lines.push(line)), true);
  assert.equal(hold.warnDroppedAnalytics(429, '', line => lines.push(line)), true);
  assert.equal(lines.length, 4);
  lines.forEach(line => assert.match(line, /混み合ったときは統計が実際より少なく出ることがある/));
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
