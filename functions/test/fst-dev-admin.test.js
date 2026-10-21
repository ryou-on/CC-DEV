'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createGuard } = require('../cost-guard');
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

function setup(handlerFactory, { email = 'user@example.test', uid = 'user-1', records = {} } = {}) {
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
  const records = { [`fst_surveys/${SURVEY}`]: { active: true, title: '題' } };
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

test('a second answer and an inactive survey do not write', async () => {
  const records = { [`fst_surveys/${SURVEY}`]: { active: true } };
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
