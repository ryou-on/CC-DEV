'use strict';

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { getGuard, sendCostError, CostError, periodKeys } = require('./cost-guard');
const { isEditorEmail } = require('./editor-policy');
const { clientIp } = require('./client-ip');
const { sourceRev } = require('./fst-rev');

const ADMIN_LIMITS = Object.freeze({ userMinute: 10, userDay: 100, ipMinute: 20, ipDay: 200 });
const ANSWER_LIMITS = Object.freeze({ userMinute: 5, userDay: 30, ipMinute: 20, ipDay: 100 });
const ADMIN_FIELDS = new Set(['kind', 'active', 'title', 'message', 'enabled', 'minVersion', 'targetBuild']);
const SURVEY_FIELDS = new Set(['kind', 'title', 'question', 'type', 'options', 'surveyId', 'active']);
const ANSWER_FIELDS = new Set(['surveyId', 'answer']);
const BUILDS = new Set(['all', 'dev', 'stable']);
const SURVEY_TYPES = new Set(['options', 'text']);
const SURVEY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,20})?$/;
const MIN_VERSION_MAX = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_OPTIONS = {
  region: 'asia-northeast1',
  cors: ['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com'],
  timeoutSeconds: 20,
  memory: '256MiB',
  maxInstances: 2,
  concurrency: 8,
  labels: { 'fst-rev': sourceRev() },
};

function uidHash(uid) {
  return crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 16);
}

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function isSurveyId(value) {
  return SURVEY_ID.test(value) && !/^__.*__$/.test(value);
}

function surveyIdOf(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!isSurveyId(id)) return null;
  return id;
}

function minVersionOf(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MIN_VERSION_MAX) return null;
  const bare = raw.replace(/^v/, '');
  if (!bare || bare.length > MIN_VERSION_MAX || !SEMVER.test(bare)) return null;
  return bare;
}

function rejectUnknown(body, allowed, code) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CostError(400, code);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new CostError(400, code);
  }
}

function text(value, max, { empty = false } = {}) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  if ((!empty && !out) || out.length > max) return null;
  return out;
}

async function assertBudgetOpen(db) {
  const global = await db.doc('costControls/global').get();
  if (!global.exists || global.data()?.enabled !== true) throw new CostError(503, 'SERVICE_PAUSED');
}

async function consume(db, id, limit, now) {
  const ref = db.doc(`fstRateLimits/${id}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const count = data && Number.isSafeInteger(data.count) && data.count >= 0 ? data.count : (data ? null : 0);
    if (count === null) throw new CostError(503, 'INVALID_QUOTA_STATE');
    if (count >= limit) throw new CostError(429, 'USAGE_LIMIT');
    tx.set(ref, { count: count + 1, updatedAtMs: now, expiresAt: new Date(now + 3 * DAY_MS) });
  });
}

async function limitActor(db, actor, req, prefix, limits, now) {
  const keys = periodKeys(now);
  const minute = Math.floor(now / 60000);
  const user = hashId(actor.uid);
  const ip = hashId(clientIp(req));
  await consume(db, `${prefix}_u_${user}_m_${minute}`, limits.userMinute, now);
  await consume(db, `${prefix}_u_${user}_d_${keys.day}`, limits.userDay, now);
  await consume(db, `${prefix}_ip_${ip}_m_${minute}`, limits.ipMinute, now);
  await consume(db, `${prefix}_ip_${ip}_d_${keys.day}`, limits.ipDay, now);
}

function requireEditor(actor) {
  if (!isEditorEmail(actor.email)) throw new CostError(403, 'EDITOR_REQUIRED');
}

function createFstDevAdminHandler({ authorize, db, now = Date.now, serverTimestamp, limits = ADMIN_LIMITS }) {
  return async function record(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      requireEditor(actor);
      rejectUnknown(req.body, ADMIN_FIELDS, 'INVALID_ADMIN');
      const kind = req.body.kind;
      let ref;
      let row;
      if (kind === 'broadcast') {
        const title = text(req.body.title, 200, { empty: true });
        const message = text(req.body.message, 2000, { empty: true });
        if (typeof req.body.active !== 'boolean' || title === null || message === null) {
          throw new CostError(400, 'INVALID_ADMIN');
        }
        ref = db.doc('fst_admin/broadcast');
        row = { active: req.body.active, title, message, updatedAt: serverTimestamp() };
      } else if (kind === 'forceUpdate') {
        const minVersion = minVersionOf(req.body.minVersion);
        const message = text(req.body.message, 500, { empty: true });
        if (typeof req.body.enabled !== 'boolean' || minVersion === null || message === null || !BUILDS.has(req.body.targetBuild)) {
          throw new CostError(400, 'INVALID_ADMIN');
        }
        ref = db.doc('fst_admin/forceUpdate');
        row = {
          enabled: req.body.enabled, minVersion, message, targetBuild: req.body.targetBuild, updatedAt: serverTimestamp(),
        };
      } else {
        throw new CostError(400, 'INVALID_ADMIN');
      }
      await assertBudgetOpen(db);
      await limitActor(db, actor, req, 'adm', limits, now());
      await ref.set(row);
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ ok: true });
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

function createFstSurveyHandler({ authorize, db, now = Date.now, serverTimestamp, limits = ADMIN_LIMITS }) {
  return async function record(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      requireEditor(actor);
      rejectUnknown(req.body, SURVEY_FIELDS, 'INVALID_SURVEY');
      const at = now();
      if (req.body.kind === 'create') {
        const title = text(req.body.title, 200);
        const question = text(req.body.question, 2000);
        const type = req.body.type;
        const options = req.body.options;
        if (!title || !question || !SURVEY_TYPES.has(type) || !Array.isArray(options) || options.length > 20) {
          throw new CostError(400, 'INVALID_SURVEY');
        }
        const clean = [];
        for (const item of options) {
          const option = text(item, 200);
          if (!option) throw new CostError(400, 'INVALID_SURVEY');
          clean.push(option);
        }
        if (type === 'text' && clean.length !== 0) throw new CostError(400, 'INVALID_SURVEY');
        if (type === 'options' && clean.length === 0) throw new CostError(400, 'INVALID_SURVEY');
        await assertBudgetOpen(db);
        await limitActor(db, actor, req, 'sv', limits, at);
        const id = `SV_${hashId(actor.uid + '\0' + at + '\0' + Math.random()).slice(0, 16)}`;
        await db.doc(`fst_surveys/${id}`).set({
          title, question, type, options: clean, active: false, createdAt: serverTimestamp(),
        });
        res.set('Cache-Control', 'no-store');
        res.status(201).json({ ok: true, surveyId: id });
        return;
      }
      if (req.body.kind === 'setActive') {
        const surveyId = surveyIdOf(req.body.surveyId);
        if (!surveyId || typeof req.body.active !== 'boolean') {
          throw new CostError(400, 'INVALID_SURVEY');
        }
        await assertBudgetOpen(db);
        await limitActor(db, actor, req, 'sv', limits, at);
        const ref = db.doc(`fst_surveys/${surveyId}`);
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new CostError(404, 'SURVEY_NOT_FOUND');
          tx.set(ref, { active: req.body.active }, { merge: true });
        });
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ ok: true });
        return;
      }
      throw new CostError(400, 'INVALID_SURVEY');
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

function createFstSurveyAnswerHandler({ authorize, db, now = Date.now, serverTimestamp, limits = ANSWER_LIMITS }) {
  return async function record(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      rejectUnknown(req.body, ANSWER_FIELDS, 'INVALID_ANSWER');
      const surveyId = surveyIdOf(req.body.surveyId);
      const answer = text(req.body.answer, 2000);
      if (!surveyId || !answer) throw new CostError(400, 'INVALID_ANSWER');
      await assertBudgetOpen(db);
      const survey = await db.doc(`fst_surveys/${surveyId}`).get();
      const data = survey.exists ? survey.data() : null;
      if (!data || data.active !== true) throw new CostError(404, 'SURVEY_NOT_FOUND');
      if (data.type === 'options') {
        if (!Array.isArray(data.options) || !data.options.includes(answer)) throw new CostError(400, 'INVALID_ANSWER');
      } else if (data.type !== 'text') {
        throw new CostError(400, 'INVALID_ANSWER');
      }
      await limitActor(db, actor, req, 'ans', limits, now());
      const hash = uidHash(actor.uid);
      const ref = db.doc(`fst_survey_answers/${surveyId}_${hash}`);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists) throw new CostError(409, 'ALREADY_ANSWERED');
        tx.set(ref, { surveyId, uidHash: hash, answer, answeredAt: serverTimestamp() });
      });
      res.set('Cache-Control', 'no-store');
      res.status(201).json({ ok: true });
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

function bind(factory, service) {
  return onRequest(REQUEST_OPTIONS, (req, res) => {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp();
    return factory({
      authorize: request => getGuard().authorize(request, service),
      db: admin.firestore(),
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    })(req, res);
  });
}

exports.uidHash = uidHash;
exports.isSurveyId = isSurveyId;
exports.minVersionOf = minVersionOf;
exports.createFstDevAdminHandler = createFstDevAdminHandler;
exports.createFstSurveyHandler = createFstSurveyHandler;
exports.createFstSurveyAnswerHandler = createFstSurveyAnswerHandler;
exports.recordFstDevAdmin = bind(createFstDevAdminHandler, 'fstDevAdmin');
exports.recordFstSurvey = bind(createFstSurveyHandler, 'fstDevAdmin');
exports.submitFstSurveyAnswer = bind(createFstSurveyAnswerHandler, 'fstSurveyAnswer');
