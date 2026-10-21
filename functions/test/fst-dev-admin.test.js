'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createGuard, rateOf, periodKeys, retryAfterSeconds } = require('../cost-guard');
const {
  uidHash, createFstDevAdminHandler, createFstSurveyHandler, createFstSurveyAnswerHandler,
} = require('../fst-dev-admin');

const NOW = Date.parse('2026-10-15T15:30:00Z');
const SURVEY = 'SV_' + 'a'.repeat(16);

function memoryDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  function snap(path) {
    return { exists: records.has(path), data: () => records.get(path) };
  }
  function write(path, value, options) {
    if (options && options.merge && records.has(path)) {
      records.set(path, { ...records.get(path), ...value });
    } else {
      records.set(path, value);
    }
  }
  return {
    records,
    doc(path) {
      return {
        path,
        get: async () => snap(path),
        set: async (value, options) => write(path, value, options),
      };
    },
    runTransaction(fn) {
      const run = queue.then(async () => {
        const writes = [];
        const result = await fn({
          get: async ref => snap(ref.path),
          set: (ref, value, options) => writes.push([ref.path, value, options]),
        });
        writes.forEach(([path, value, options]) => write(path, value, options));
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

function response() {
  return {
    statusCode: 200, headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function request(body, headers = {}) {
  const all = {
    origin: 'https://cc-dev-ps7.web.app',
    authorization: 'Bearer valid',
    'x-firebase-appcheck': 'appcheck',
    'x-forwarded-for': '203.0.113.20',
    ...headers,
  };
  return {
    method: 'POST', body, ip: '203.0.113.20',
    rawBody: Buffer.from(JSON.stringify(body || {})),
    get: key => all[key.toLowerCase()],
  };
}

let scopeSeq = 0;

function watch(db) {
  const seen = { gets: 0, transactions: 0 };
  const origDoc = db.doc.bind(db);
  db.doc = path => {
    const ref = origDoc(path);
    const origGet = ref.get.bind(ref);
    ref.get = async () => {
      seen.gets += 1;
      return origGet();
    };
    return ref;
  };
  const origTx = db.runTransaction.bind(db);
  db.runTransaction = fn => {
    seen.transactions += 1;
    return origTx(fn);
  };
  return seen;
}

function setup(handlerFactory, { email = 'user@example.test', uid = 'user-1', records = {}, holdScope, ...factory } = {}) {
  const db = memoryDb({ 'costControls/global': { enabled: true }, ...records });
  const guard = createGuard({
    db,
    now: () => NOW,
    verifyIdToken: async token => {
      if (token !== 'valid') throw Error('bad');
      return { uid, email, email_verified: true, firebase: { sign_in_provider: 'google.com' } };
    },
    verifyAppCheck: async token => { if (token !== 'appcheck') throw Error('bad'); },
  });
  const handler = handlerFactory({
    authorize: req => guard.authorize(req, handlerFactory === createFstSurveyAnswerHandler ? 'fstSurveyAnswer' : 'fstDevAdmin'),
    db,
    now: () => NOW,
    serverTimestamp: () => 'server-time',
    holdScope: holdScope || `adm${++scopeSeq}:`,
    ...factory,
  });
  return { db, handler };
}

test('uid hash is the first 16 hex chars of sha256 and not btoa', () => {
  const expected = crypto.createHash('sha256').update('user-1').digest('hex').slice(0, 16);
  assert.equal(uidHash('user-1'), expected);
  assert.equal(uidHash('user-1').includes('user-1'), false);
  assert.notEqual(uidHash('user-1'), uidHash('user-2'));
});

test('only an editor can publish a broadcast, and unknown fields are rejected', async () => {
  const reader = setup(createFstDevAdminHandler);
  const denied = response();
  await reader.handler(request({ kind: 'broadcast', active: true, title: '告知', message: '本文' }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(reader.db.records.has('fst_admin/broadcast'), false);

  const editor = setup(createFstDevAdminHandler, { email: 'person@splineglobal.com' });
  const bad = response();
  await editor.handler(request({ kind: 'broadcast', active: true, title: '告知', message: '本文', uidHash: 'x' }), bad);
  assert.equal(bad.body.error, 'INVALID_ADMIN');
  const ok = response();
  await editor.handler(request({ kind: 'broadcast', active: true, title: '告知', message: '本文' }), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(editor.db.records.get('fst_admin/broadcast'), {
    active: true, title: '告知', message: '本文', updatedAt: 'server-time',
  });
});

test('only an editor can create a survey', async () => {
  const reader = setup(createFstSurveyHandler);
  const denied = response();
  await reader.handler(request({
    kind: 'create', title: '題', question: '問い', type: 'text', options: [],
  }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal([...reader.db.records.keys()].some(key => key.startsWith('fst_surveys/')), false);

  const editor = setup(createFstSurveyHandler, { email: 'person@splineglobal.com' });
  const created = response();
  await editor.handler(request({
    kind: 'create', title: '題', question: '問い', type: 'options', options: ['はい', 'いいえ'],
  }), created);
  assert.equal(created.statusCode, 201);
  assert.match(created.body.surveyId, /^SV_[0-9a-f]{16}$/);
  const row = editor.db.records.get(`fst_surveys/${created.body.surveyId}`);
  assert.deepEqual(row.options, ['はい', 'いいえ']);
  assert.equal(row.active, false);
});

test('an answer stores the caller hash and rejects another user hash', async () => {
  const records = { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text', title: '題' } };
  const first = setup(createFstSurveyAnswerHandler, { records });
  const spoof = response();
  await first.handler(request({ surveyId: SURVEY, answer: 'はい', uidHash: uidHash('user-2') }), spoof);
  assert.equal(spoof.statusCode, 400);
  assert.equal([...first.db.records.keys()].some(key => key.startsWith('fst_survey_answers/')), false);

  const saved = response();
  await first.handler(request({ surveyId: SURVEY, answer: 'はい' }), saved);
  assert.equal(saved.statusCode, 201);
  const id = `fst_survey_answers/${SURVEY}_${uidHash('user-1')}`;
  assert.equal(first.db.records.get(id).uidHash, uidHash('user-1'));
  assert.equal(JSON.stringify([...first.db.records.values()]).includes('user-1'), false);

  const other = setup(createFstSurveyAnswerHandler, { uid: 'user-2', records: Object.fromEntries(first.db.records) });
  const again = response();
  await other.handler(request({ surveyId: SURVEY, answer: '別の人' }), again);
  assert.equal(again.statusCode, 201);
  assert.equal(other.db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-2')}`).uidHash, uidHash('user-2'));
  assert.equal(other.db.records.has(id), true);
});

test('a duplicate answer is rejected before the global cap is spent', async () => {
  const records = { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' } };
  const limits = { ...rateOf('fstSurveyAnswer'), globalMinute: 2 };
  const { db, handler } = setup(createFstSurveyAnswerHandler, { records, limits });
  await handler(request({ surveyId: SURVEY, answer: '1' }), response());
  const duplicate = response();
  await handler(request({ surveyId: SURVEY, answer: '2' }), duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.error, 'ALREADY_ANSWERED');
  const globalDay = [...db.records.entries()].find(([key]) => key.includes('ans_g_d_'));
  assert.equal(globalDay[1].count, 1);
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, '1');
});

test('survey create and setActive use separate caps', async () => {
  const { db, handler } = setup(createFstSurveyHandler, {
    email: 'person@splineglobal.com',
    createLimits: { ...rateOf('fstSurveyCreate'), globalMinute: 1 },
    activateLimits: { ...rateOf('fstSurveySetActive'), globalMinute: 1 },
  });
  const created = response();
  await handler(request({
    kind: 'create', title: '題', question: '問い', type: 'options', options: ['はい'],
  }), created);
  assert.equal(created.statusCode, 201);
  const published = response();
  await handler(request({ kind: 'setActive', surveyId: created.body.surveyId, active: true }), published);
  assert.equal(published.statusCode, 200);
  const secondCreate = response();
  await handler(request({
    kind: 'create', title: '題2', question: '問い', type: 'text', options: [],
  }), secondCreate);
  assert.equal(secondCreate.statusCode, 429);
  const secondActive = response();
  await handler(request({ kind: 'setActive', surveyId: created.body.surveyId, active: false }), secondActive);
  assert.equal(secondActive.statusCode, 429);
  const keys = [...db.records.keys()];
  assert.equal(keys.some(key => key.includes('sv_create_g_m_')), true);
  assert.equal(keys.some(key => key.includes('sv_active_g_m_')), true);
  assert.equal(keys.some(key => key.includes('/sv_g_')), false);
});

test('a second answer and an inactive survey do not write', async () => {
  const records = { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' } };
  const { db, handler } = setup(createFstSurveyAnswerHandler, { records });
  await handler(request({ surveyId: SURVEY, answer: '1' }), response());
  const duplicate = response();
  await handler(request({ surveyId: SURVEY, answer: '2' }), duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, '1');

  const inactive = setup(createFstSurveyAnswerHandler, {
    records: { [`fst_surveys/${SURVEY}`]: { active: false } },
  });
  const hidden = response();
  await inactive.handler(request({ surveyId: SURVEY, answer: 'はい' }), hidden);
  assert.equal(hidden.statusCode, 404);
  assert.equal([...inactive.db.records.keys()].some(key => key.startsWith('fst_survey_answers/')), false);
});

const LEGACY = 'A1b2C3d4E5f6G7h8I9j0';

test('a firestore auto id can be answered and published', async () => {
  assert.equal(/^SV_[0-9a-f]{16}$/.test(LEGACY), false);
  const editor = setup(createFstSurveyHandler, {
    email: 'person@splineglobal.com',
    records: { [`fst_surveys/${LEGACY}`]: { active: false, type: 'options', options: ['はい'] } },
  });
  const toggled = response();
  await editor.handler(request({ kind: 'setActive', surveyId: LEGACY, active: true }), toggled);
  assert.equal(toggled.statusCode, 200);
  assert.equal(editor.db.records.get(`fst_surveys/${LEGACY}`).active, true);

  const answer = setup(createFstSurveyAnswerHandler, { records: Object.fromEntries(editor.db.records) });
  const saved = response();
  await answer.handler(request({ surveyId: LEGACY, answer: 'はい' }), saved);
  assert.equal(saved.statusCode, 201);
  assert.equal(answer.db.records.get(`fst_survey_answers/${LEGACY}_${uidHash('user-1')}`).answer, 'はい');
});

test('survey ids outside firestore-safe characters are rejected', async () => {
  const editor = setup(createFstSurveyHandler, { email: 'person@splineglobal.com' });
  for (const surveyId of ['a/b', '..', '__reserved__', 'a'.repeat(129), 'has space', '']) {
    const res = response();
    await editor.handler(request({ kind: 'setActive', surveyId, active: true }), res);
    assert.equal(res.statusCode, 400, surveyId);
  }
  assert.equal([...editor.db.records.keys()].some(key => key.startsWith('fst_surveys/')), false);
  assert.equal([...editor.db.records.keys()].some(key => key.startsWith('fstRateLimits/')), false);
});

test('an options answer must be one of the choices', async () => {
  const records = {
    [`fst_surveys/${SURVEY}`]: { active: true, type: 'options', options: ['はい', 'いいえ'] },
  };
  const { db, handler } = setup(createFstSurveyAnswerHandler, { records });
  const script = response();
  await handler(request({ surveyId: SURVEY, answer: '<script>alert(1)</script>' }), script);
  assert.equal(script.statusCode, 400);
  assert.equal([...db.records.keys()].some(key => key.startsWith('fst_survey_answers/')), false);
  const ok = response();
  await handler(request({ surveyId: SURVEY, answer: ' はい ' }), ok);
  assert.equal(ok.statusCode, 201);
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, 'はい');
});

test('force update requires semver and stores a script as text', async () => {
  const editor = setup(createFstDevAdminHandler, { email: 'person@splineglobal.com' });
  for (const minVersion of ['', 'latest', '1.2', '01.2.3', 'v'.repeat(41)]) {
    const bad = response();
    await editor.handler(request({
      kind: 'forceUpdate', enabled: true, minVersion, message: '更新', targetBuild: 'dev',
    }), bad);
    assert.equal(bad.statusCode, 400, minVersion);
  }
  assert.equal(editor.db.records.has('fst_admin/forceUpdate'), false);
  const ok = response();
  const message = '<script>alert(1)</script>';
  await editor.handler(request({
    kind: 'forceUpdate', enabled: true, minVersion: 'v0.10.30-dev', message, targetBuild: 'dev',
  }), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(editor.db.records.get('fst_admin/forceUpdate'), {
    enabled: true, minVersion: '0.10.30-dev', message, targetBuild: 'dev', updatedAt: 'server-time',
  });
});

test('a closed budget and the minute cap stop answers', async () => {
  const paused = setup(createFstSurveyAnswerHandler, {
    records: {
      'costControls/global': { enabled: false },
      [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' },
    },
  });
  const closed = response();
  await paused.handler(request({ surveyId: SURVEY, answer: 'はい' }), closed);
  assert.equal(closed.statusCode, 503);
  assert.equal(closed.body.error, 'SERVICE_PAUSED');
  assert.equal([...paused.db.records.keys()].some(key => key.startsWith('fst_survey_answers/')), false);
  assert.equal([...paused.db.records.keys()].some(key => key.startsWith('fstRateLimits/')), false);

  const other = 'SV_' + 'b'.repeat(16);
  const { db, handler } = setup(createFstSurveyAnswerHandler, {
    records: {
      [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' },
      [`fst_surveys/${other}`]: { active: true, type: 'text' },
    },
    limits: { ...rateOf('fstSurveyAnswer'), userMinute: 1 },
  });
  await handler(request({ surveyId: SURVEY, answer: '1' }), response());
  const limited = response();
  await handler(request({ surveyId: other, answer: '2' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, '1');
  assert.equal(db.records.has(`fst_survey_answers/${other}_${uidHash('user-1')}`), false);
});

test('the global cap is shared and does not read the forwarded address', async () => {
  const db = memoryDb({
    'costControls/global': { enabled: true },
    [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' },
  });
  let uid = 'user-1';
  const guard = createGuard({
    db,
    now: () => NOW,
    verifyIdToken: async () => ({ uid, email: 'user@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }),
    verifyAppCheck: async () => ({}),
  });
  const handler = createFstSurveyAnswerHandler({
    authorize: req => guard.authorize(req, 'fstSurveyAnswer'),
    db,
    now: () => NOW,
    serverTimestamp: () => 'server-time',
    limits: { ...rateOf('fstSurveyAnswer'), globalMinute: 1 },
    holdScope: 'answer-global:',
  });
  await handler(request(
    { surveyId: SURVEY, answer: '1' },
    { 'x-forwarded-for': '1.1.1.1, 203.0.113.50' },
  ), response());
  uid = 'user-2';
  const limited = response();
  await handler(request(
    { surveyId: SURVEY, answer: '2' },
    { 'x-forwarded-for': '9.9.9.9, 198.51.100.8' },
  ), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.error, 'USAGE_LIMIT');
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, '1');
  assert.equal(db.records.has(`fst_survey_answers/${SURVEY}_${uidHash('user-2')}`), false);
  const keys = [...db.records.keys()].join('\n');
  assert.equal(keys.includes('203.0.113.50'), false);
  assert.equal(keys.includes('_ip_'), false);
});

test('one of two simultaneous answers is stored', async () => {
  const { db, handler } = setup(createFstSurveyAnswerHandler, {
    records: { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' } },
  });
  const first = response();
  const second = response();
  await Promise.all([
    handler(request({ surveyId: SURVEY, answer: '同時A' }), first),
    handler(request({ surveyId: SURVEY, answer: '同時B' }), second),
  ]);
  const codes = [first.statusCode, second.statusCode].sort();
  assert.deepEqual(codes, [201, 409]);
  const row = db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`);
  assert.equal(['同時A', '同時B'].includes(row.answer), true);
});

test('a text answer keeps a script string as data', async () => {
  const script = '<script>alert(1)</script>';
  const { db, handler } = setup(createFstSurveyAnswerHandler, {
    records: { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' } },
  });
  const saved = response();
  await handler(request({ surveyId: SURVEY, answer: script }), saved);
  assert.equal(saved.statusCode, 201);
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, script);
});

test('a rejected broadcast writes nothing', async () => {
  const limits = rateOf('fstDevAdmin');
  const day = periodKeys(NOW).day;
  const key = `fstRateLimits/adm_g_d_${day}`;
  const { db, handler } = setup(createFstDevAdminHandler, {
    email: 'person@splineglobal.com',
    records: { [key]: { count: limits.globalDay, updatedAtMs: NOW } },
  });
  const res = response();
  await handler(request({ kind: 'broadcast', active: true, title: '告知', message: '本文' }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], String(retryAfterSeconds(NOW, `adm_g_d_${day}`)));
  assert.equal(db.records.has('fst_admin/broadcast'), false);
  assert.equal(db.records.get(key).count, limits.globalDay);
  const user = [...db.records.entries()].find(([name]) => name.includes('/adm_u_'));
  assert.equal(user[1].dayCount, 1);
});

test('a missing survey activation spends a user attempt and writes no survey', async () => {
  const { db, handler } = setup(createFstSurveyHandler, { email: 'person@splineglobal.com' });
  const res = response();
  await handler(request({ kind: 'setActive', surveyId: SURVEY, active: true }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(db.records.has(`fst_surveys/${SURVEY}`), false);
  assert.equal([...db.records.keys()].some(key => key.includes('sv_active_g_')), false);
  const user = [...db.records.entries()].find(([name]) => name.includes('/sv_active_u_'));
  assert.equal(user[1].dayCount, 1);
});

test('a rejected answer writes nothing and a repeat does not read', async () => {
  const limits = rateOf('fstSurveyAnswer');
  const day = periodKeys(NOW).day;
  const slot = `ans_g_d_${day}`;
  const key = `fstRateLimits/${slot}`;
  const { db, handler } = setup(createFstSurveyAnswerHandler, {
    records: {
      [key]: { count: limits.globalDay, updatedAtMs: NOW },
      [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' },
    },
  });
  const seen = watch(db);
  const before = JSON.stringify([...db.records.entries()]);
  const first = response();
  await handler(request({ surveyId: SURVEY, answer: 'はい' }), first);
  assert.equal(first.statusCode, 429);
  assert.equal(first.headers['Retry-After'], String(retryAfterSeconds(NOW, slot)));
  assert.equal(Number(first.headers['Retry-After']) > 60, true);
  assert.equal([...db.records.keys()].some(name => name.startsWith('fst_survey_answers/')), false);
  assert.equal(db.records.get(key).count, limits.globalDay);
  const user = [...db.records.entries()].find(([name]) => name.includes('/ans_u_'));
  assert.equal(user[1].dayCount, 1);
  const gets = seen.gets;
  const transactions = seen.transactions;
  assert.equal(transactions, 2);
  const held = JSON.stringify([...db.records.entries()]);
  const second = response();
  await handler(request({ surveyId: SURVEY, answer: 'はい' }), second);
  assert.equal(second.statusCode, 429);
  assert.equal(seen.gets, gets);
  assert.equal(seen.transactions, transactions);
  assert.equal(JSON.stringify([...db.records.entries()]), held);
  assert.notEqual(held, before);
});

test('a failed attempt spends one user slot and does not spend the global cap', async () => {
  const mismatch = setup(createFstSurveyAnswerHandler, {
    records: { [`fst_surveys/${SURVEY}`]: { active: true, type: 'options', options: ['はい', 'いいえ'] } },
    holdScope: 'attempt-400:',
  });
  const bad = response();
  await mismatch.handler(request({ surveyId: SURVEY, answer: 'どちらでもない' }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, 'INVALID_ANSWER');
  const mismatchUser = [...mismatch.db.records.entries()].find(([name]) => name.includes('/ans_u_'));
  assert.equal(mismatchUser[1].dayCount, 1);
  assert.equal([...mismatch.db.records.keys()].some(name => name.includes('ans_g_')), false);
  assert.equal([...mismatch.db.records.keys()].some(name => name.startsWith('fst_survey_answers/')), false);

  const duplicate = setup(createFstSurveyAnswerHandler, {
    records: { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' } },
    holdScope: 'attempt-409:',
  });
  await duplicate.handler(request({ surveyId: SURVEY, answer: '1' }), response());
  const again = response();
  await duplicate.handler(request({ surveyId: SURVEY, answer: '2' }), again);
  assert.equal(again.statusCode, 409);
  const dupUser = [...duplicate.db.records.entries()].find(([name]) => name.includes('/ans_u_'));
  const dupGlobal = [...duplicate.db.records.entries()].find(([name]) => name.includes('ans_g_d_'));
  assert.equal(dupUser[1].dayCount, 2);
  assert.equal(dupGlobal[1].count, 1);
  assert.equal(duplicate.db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, '1');
});

test('the user cap is counted before the heavy transaction and then waits', async () => {
  let clock = NOW;
  const { db, handler } = setup(createFstSurveyAnswerHandler, {
    records: { [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' } },
    limits: { ...rateOf('fstSurveyAnswer'), userMinute: 1 },
    now: () => clock,
    holdScope: 'user-cap-before:',
  });
  const seen = watch(db);
  const saved = response();
  await handler(request({ surveyId: SURVEY, answer: '1' }), saved);
  assert.equal(saved.statusCode, 201);
  assert.equal(seen.transactions, 2);
  const gets = seen.gets;
  const transactions = seen.transactions;
  const limited = response();
  await handler(request({ surveyId: SURVEY, answer: '2' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(seen.transactions, transactions + 1);
  assert.equal(seen.gets, gets + 1);
  assert.equal(db.records.get(`fst_survey_answers/${SURVEY}_${uidHash('user-1')}`).answer, '1');
  const user = [...db.records.entries()].find(([name]) => name.includes('/ans_u_'));
  assert.equal(user[1].minuteCount, 1);
  const heldGets = seen.gets;
  const heldTx = seen.transactions;
  const repeat = response();
  await handler(request({ surveyId: SURVEY, answer: '3' }), repeat);
  assert.equal(repeat.statusCode, 429);
  assert.equal(seen.gets, heldGets);
  assert.equal(seen.transactions, heldTx);
  clock = NOW + 60 * 1000;
  const next = response();
  await handler(request({ surveyId: SURVEY, answer: '4' }), next);
  assert.equal(next.statusCode, 409);
  assert.equal(seen.transactions, heldTx + 2);
  const globalDay = [...db.records.entries()].find(([name]) => name.includes('ans_g_d_'));
  assert.equal(globalDay[1].count, 1);
});

test('an already answered survey at five per second stays inside the free read tier', async () => {
  const hash = uidHash('user-1');
  const answerId = `fst_survey_answers/${SURVEY}_${hash}`;
  let clock = NOW;
  const { db, handler } = setup(createFstSurveyAnswerHandler, {
    records: {
      [`fst_surveys/${SURVEY}`]: { active: true, type: 'text' },
      [answerId]: { surveyId: SURVEY, uidHash: hash, answer: '済', answeredAt: 'server-time' },
    },
    now: () => clock,
    holdScope: 'hammer:',
  });
  let reads = 0;
  let writes = 0;
  const origDoc = db.doc.bind(db);
  db.doc = path => {
    const ref = origDoc(path);
    const origGet = ref.get.bind(ref);
    ref.get = async () => {
      reads += 1;
      return origGet();
    };
    return ref;
  };
  const origTx = db.runTransaction.bind(db);
  db.runTransaction = fn => origTx(async tx => {
    const origGet = tx.get.bind(tx);
    const origSet = tx.set.bind(tx);
    tx.get = async ref => {
      reads += 1;
      return origGet(ref);
    };
    tx.set = (ref, value, options) => {
      writes += 1;
      return origSet(ref, value, options);
    };
    return fn(tx);
  });
  const perSecond = 5;
  const calls = 6 * 60 * perSecond + perSecond;
  for (let i = 0; i < calls; i += 1) {
    clock = NOW + Math.floor(i / perSecond) * 1000;
    const res = response();
    await handler(request({ surveyId: SURVEY, answer: '再送' }), res);
    if (i === 1505) {
      assert.equal(res.statusCode, 429);
      assert.equal(Number(res.headers['Retry-After']) > 60, true);
    }
  }
  assert.equal(reads, 192);
  assert.equal(writes, 30);
  const user = [...db.records.entries()].find(([name]) => name.includes('/ans_u_'));
  assert.equal(user[1].dayCount, 30);
  assert.equal([...db.records.keys()].some(name => name.includes('ans_g_')), false);
  assert.equal(db.records.get(answerId).answer, '済');
  const capped = reads;
  clock = NOW + 10 * 60 * 1000;
  for (let i = 0; i < perSecond * 10; i += 1) {
    const res = response();
    await handler(request({ surveyId: SURVEY, answer: '再送' }), res);
    assert.equal(res.statusCode, 429);
  }
  assert.equal(reads, capped);
  assert.equal(40 * capped, 7680);
  assert.equal(40 * capped < 50000, true);
  assert.equal(40 * writes, 1200);
  assert.equal(40 * writes < 20000, true);
});
