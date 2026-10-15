'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFeedbackApi, createHttpHandler, validateSubmission, nextRate, FeedbackError, MINUTE_LIMIT } = require('../fst-feedback');

const NOW = Date.parse('2026-10-15T01:00:00Z');
const verified = { uid: 'user-1', email: 'member@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const editor = { uid: 'editor-1', email: 'someone@splineglobal.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };

function fakeDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  const snap = path => ({ exists: records.has(path), data: () => records.get(path) });
  return {
    records,
    doc: path => ({ path }),
    async runTransaction(fn) {
      const writes = [];
      const result = await fn({
        getAll: async (...refs) => refs.map(ref => snap(ref.path)),
        get: async ref => snap(ref.path),
        set: (ref, value) => writes.push(['set', ref.path, value]),
        update: (ref, value) => writes.push(['update', ref.path, value]),
      });
      for (const [op, path, value] of writes) {
        records.set(path, op === 'set' ? value : { ...records.get(path), ...value });
      }
      return result;
    },
  };
}

function request(body, headers = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const all = {
    authorization: 'Bearer test-token',
    'x-firebase-appcheck': 'attested',
    'content-type': 'application/json',
    origin: 'https://cc-dev-ps7.web.app',
    ...headers,
  };
  return { method: 'POST', body, rawBody: raw, get: key => all[String(key).toLowerCase()] };
}

function submission(extra = {}) {
  return {
    appId: 'flight-strip-todo',
    version: '0.5.17',
    url: 'https://cc-dev-ps7.web.app/Flight_Strip_TODO/?secret=1#frag',
    subject: '件名 <b>',
    message: '画面が更新されません',
    email: 'reply@example.test',
    build: 'stable',
    type: 'bug',
    faxNumber: '',
    openedAtMs: NOW - 5000,
    ...extra,
  };
}

function fixture(overrides = {}, records = {}) {
  const db = fakeDb(records);
  let verifiedTokens = 0;
  const api = createFeedbackApi({
    db,
    now: () => NOW,
    timestamp: at => new Date(at),
    verifyIdToken: async () => { verifiedTokens += 1; return verified; },
    verifyAppCheck: async () => ({}),
    ...overrides,
  });
  return { db, api, verifiedTokens: () => verifiedTokens };
}

test('submission validation keeps text, strips url secrets, and rejects unknown status', () => {
  const value = validateSubmission(submission(), NOW);
  assert.equal(value.url, 'https://cc-dev-ps7.web.app/Flight_Strip_TODO/');
  assert.equal(value.message, '画面が更新されません');
  assert.equal(value.subject, '件名 <b>');
  assert.throws(() => validateSubmission(submission({ status: 'unreviewed' }), NOW), e => e.code === 'UNKNOWN_FIELD');
  assert.throws(() => validateSubmission(submission({ message: '   ' }), NOW), e => e.code === 'INVALID_MESSAGE');
  assert.throws(() => validateSubmission(submission({ message: 1 }), NOW), e => e.code === 'INVALID_MESSAGE');
  assert.throws(() => validateSubmission(submission({ message: 'x'.repeat(2001) }), NOW), e => e.code === 'INVALID_MESSAGE');
  assert.throws(() => validateSubmission(submission({ url: 'http://cc-dev-ps7.web.app/Flight_Strip_TODO/' }), NOW), e => e.code === 'INVALID_URL');
  assert.throws(() => validateSubmission(submission({ appId: 'other-app' }), NOW), e => e.code === 'INVALID_APP');
  assert.throws(() => validateSubmission(submission({ version: 'v0.5.17' }), NOW), e => e.code === 'INVALID_VERSION');
  assert.throws(() => validateSubmission(submission({ type: null }), NOW), e => e.code === 'INVALID_TYPE');
  assert.throws(() => validateSubmission(submission({ faxNumber: 'filled' }), NOW), e => e.code === 'REJECTED');
  assert.throws(() => validateSubmission(submission({ openedAtMs: NOW - 100 }), NOW), e => e.code === 'INVALID_TIMING');
  assert.throws(() => validateSubmission(submission({ build: 'dev' }), NOW), e => e.code === 'INVALID_BUILD');
});

test('unauthenticated, unverified, anonymous, and missing App Check do not write', async () => {
  const cases = [
    [{ authorization: undefined }, {}, 'SIGN_IN_REQUIRED'],
    [{ origin: 'https://evil.example' }, {}, 'ORIGIN_DENIED'],
    [{ 'content-type': 'text/plain' }, {}, 'INVALID_CONTENT_TYPE'],
    [{}, { verifyIdToken: async () => { throw Error('bad'); } }, 'INVALID_ID_TOKEN'],
    [{}, { verifyIdToken: async () => ({ uid: 'u', email_verified: false, firebase: { sign_in_provider: 'google.com' } }) }, 'VERIFIED_ACCOUNT_REQUIRED'],
    [{}, { verifyIdToken: async () => ({ uid: 'anon', email_verified: true, firebase: { sign_in_provider: 'anonymous' } }) }, 'VERIFIED_ACCOUNT_REQUIRED'],
    [{ 'x-firebase-appcheck': undefined }, {}, 'APP_CHECK_REQUIRED'],
    [{}, { verifyAppCheck: async () => { throw Error('bad attestation'); } }, 'INVALID_APP_CHECK'],
  ];
  for (const [headers, overrides, code] of cases) {
    const { db, api } = fixture(overrides);
    await assert.rejects(api.submit(request(submission(), headers)), e => e instanceof FeedbackError && e.code === code);
    assert.equal(db.records.size, 0);
  }
});

test('oversized body fails before token verification', async () => {
  let called = false;
  const { api } = fixture({ verifyIdToken: async () => { called = true; return verified; } });
  const req = request(submission());
  req.rawBody = Buffer.alloc(16001);
  await assert.rejects(api.submit(req), e => e.httpStatus === 413);
  assert.equal(called, false);
});

test('accepted feedback is stored unreviewed with the token uid and a server id', async () => {
  const { db, api } = fixture();
  const result = await api.submit(request(submission({ email: '' })));
  assert.deepEqual(result, { ok: true, feedbackId: 'FB_0001' });
  const saved = db.records.get('fst_feedback/FB_0001');
  assert.equal(saved.status, 'unreviewed');
  assert.equal(saved.uid, 'user-1');
  assert.equal(saved.replySent, false);
  assert.equal(saved.appId, 'flight-strip-todo');
  assert.equal(saved.version, '0.5.17');
  assert.equal(saved.type, 'bug');
  assert.equal(saved.email, '');
  assert.equal(saved.subject, '件名 <b>');
  assert.equal(saved.createdAt.toISOString(), new Date(NOW).toISOString());
  assert.equal(db.records.get('fst_feedback_meta/counter').count, 1);
  assert.equal(db.records.get('fst_feedback_limits/' + require('node:crypto').createHash('sha256').update('user-1').digest('hex')).minuteCount, 1);
  assert.equal(JSON.stringify(saved).includes('attested'), false);
});

test('rate limit and duplicate content do not advance the counter', async () => {
  const { db, api } = fixture();
  for (let i = 0; i < MINUTE_LIMIT; i += 1) {
    await api.submit(request(submission({ message: '本文' + i, subject: '件名' + i })));
  }
  await assert.rejects(api.submit(request(submission({ message: '別の本文', subject: '別件' }))), e => e.code === 'RATE_LIMIT');
  assert.equal(db.records.get('fst_feedback_meta/counter').count, MINUTE_LIMIT);
  const limited = fakeDb({ 'fst_feedback_meta/counter': { count: 3 } });
  const limitedApi = createFeedbackApi({
    db: limited, now: () => NOW, timestamp: at => new Date(at),
    verifyIdToken: async () => verified, verifyAppCheck: async () => ({}),
  });
  await limitedApi.submit(request(submission()));
  await assert.rejects(limitedApi.submit(request(submission())), e => e.code === 'DUPLICATE');
  assert.equal(limited.records.get('fst_feedback_meta/counter').count, 4);
  assert.throws(
    () => nextRate({ minuteKey: Math.floor(NOW / 60000), minuteCount: 5, dayKey: '2026-10-15', dayCount: 5 }, NOW, 'x'),
    e => e.code === 'RATE_LIMIT'
  );
});

test('a broken counter or transaction writes nothing', async () => {
  const broken = fixture({}, { 'fst_feedback_meta/counter': { count: 'many' } });
  await assert.rejects(broken.api.submit(request(submission())), e => e.code === 'COUNTER_UNAVAILABLE');
  assert.equal(broken.db.records.has('fst_feedback/FB_0001'), false);
  const db = fakeDb();
  db.runTransaction = async () => { throw Error('firestore down'); };
  const api = createFeedbackApi({
    db, now: () => NOW, verifyIdToken: async () => verified, verifyAppCheck: async () => ({}),
  });
  await assert.rejects(api.submit(request(submission())), e => e.code === 'UNAVAILABLE');
  assert.equal(db.records.size, 0);
});

test('only a verified editor can change status, and the message stays', async () => {
  const seed = {
    'fst_feedback/FB_0007': {
      feedbackId: 'FB_0007', message: '元の本文', uid: 'user-1', appId: 'flight-strip-todo', status: 'unreviewed',
    },
  };
  const denied = fixture();
  await assert.rejects(denied.api.update(request({ feedbackId: 'FB_0007', status: 'resolved', message: '改ざん' })), e => e.code === 'EDITOR_REQUIRED');
  assert.equal(denied.db.records.size, 0);
  const db = fakeDb(seed);
  const api = createFeedbackApi({
    db, now: () => NOW, timestamp: at => new Date(at),
    verifyIdToken: async () => editor, verifyAppCheck: async () => ({}),
  });
  const updated = await api.update(request({ feedbackId: 'FB_0007', status: 'in_progress', replyText: '確認します', replySent: false }));
  assert.equal(updated.ok, true);
  const saved = db.records.get('fst_feedback/FB_0007');
  assert.equal(saved.status, 'in_progress');
  assert.equal(saved.message, '元の本文');
  assert.equal(saved.uid, 'user-1');
  assert.equal(saved.replyText, '確認します');
  await assert.rejects(api.update(request({ feedbackId: 'FB_0007', status: 'new' })), e => e.code === 'INVALID_STATUS');
  await assert.rejects(api.update(request({ feedbackId: 'FB_0007', status: 'replied' })), e => e.code === 'INVALID_STATUS');
  await assert.rejects(api.update(request({ feedbackId: 'FB_9999', status: 'reviewed' })), e => e.code === 'NOT_FOUND');
  assert.equal(db.records.has('fst_feedback/FB_9999'), false);
});

test('http handler returns a code without the internal message', async () => {
  const api = { submit: async () => { throw new FeedbackError(429, 'RATE_LIMIT'); } };
  const handler = createHttpHandler(api, 'submit');
  const headers = {};
  let status = 0;
  let payload;
  const res = {
    set: (k, v) => { headers[k] = v; },
    status: code => { status = code; return res; },
    json: body => { payload = body; },
  };
  await handler(request(submission()), res);
  assert.equal(status, 429);
  assert.deepEqual(payload, { error: 'RATE_LIMIT' });
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['Retry-After'], '60');
  assert.equal(typeof headers['X-Request-Id'], 'string');
  const denied = createHttpHandler(api, 'submit');
  let methodStatus = 0;
  await denied({ method: 'GET', get: () => undefined }, { set() {}, status(code) { methodStatus = code; return this; }, json() {} });
  assert.equal(methodStatus, 405);
});
