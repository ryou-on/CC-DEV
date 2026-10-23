'use strict';

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const {
  getGuard, sendCostError, CostError, periodKeys, rateOf, reserveFst, consumeUserAttempt, holdFstRejection,
  rejectIfServicePaused, browserOrigins,
} = require('./cost-guard');
const { isEditorEmail } = require('./editor-policy');
const { sourceRev } = require('./fst-rev');
const ADMIN_FIELDS = new Set(['kind', 'active', 'title', 'message', 'enabled', 'minVersion', 'targetBuild']);
const SURVEY_FIELDS = new Set(['kind', 'title', 'question', 'type', 'options', 'surveyId', 'active']);
const ANSWER_FIELDS = new Set(['surveyId', 'answer']);
const BUILDS = new Set(['all', 'dev', 'stable']);
const SURVEY_TYPES = new Set(['options', 'text']);
const SURVEY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,20})?$/;
const MIN_VERSION_MAX = 40;
const REQUEST_OPTIONS = {
  region: 'asia-northeast1',
  cors: browserOrigins(),
  timeoutSeconds: 20,
  memory: '256MiB',
  maxInstances: 1,
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

async function withLimit(db, actor, prefix, limits, now, write, holdScope) {
  const holdKey = `${holdScope}${prefix}\0${actor.uid}`;
  const user = hashId(actor.uid);
  await rejectIfServicePaused(db, holdScope, holdKey, now, `${prefix}_u_${user}`, limits);
  try {
    await consumeUserAttempt(db, `${prefix}_u_${user}`, limits, now);
  } catch (error) {
    holdFstRejection(holdScope, holdKey, now, error);
  }
  const keys = periodKeys(now);
  const minute = Math.floor(now / 60000);
  try {
    return await reserveFst(db, [
      { id: `${prefix}_g_m_${minute}`, limit: limits.globalMinute },
      { id: `${prefix}_g_d_${keys.day}`, limit: limits.globalDay },
    ], now, write);
  } catch (error) {
    holdFstRejection(holdScope, holdKey, now, error);
  }
}

function requireEditor(actor) {
  if (!isEditorEmail(actor.email)) throw new CostError(403, 'EDITOR_REQUIRED');
}

function createFstDevAdminHandler({
  authorize, db, now = Date.now, serverTimestamp, limits = rateOf('fstDevAdmin'), holdScope = '',
}) {
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
      const at = now();
      await withLimit(db, actor, 'adm', limits, at, async tx => {
        tx.set(ref, row);
      }, holdScope);
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ ok: true });
    } catch (error) {
      sendCostError(res, error);
    }
  };
}

function createFstSurveyHandler({
  authorize, db, now = Date.now, serverTimestamp,
  createLimits = rateOf('fstSurveyCreate'),
  activateLimits = rateOf('fstSurveySetActive'),
  holdScope = '',
}) {
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
        const id = `SV_${hashId(actor.uid + '\0' + at + '\0' + Math.random()).slice(0, 16)}`;
        await withLimit(db, actor, 'sv_create', createLimits, at, async tx => {
          tx.set(db.doc(`fst_surveys/${id}`), {
            title, question, type, options: clean, active: false, createdAt: serverTimestamp(),
          });
        }, holdScope);
        res.set('Cache-Control', 'no-store');
        res.status(201).json({ ok: true, surveyId: id });
        return;
      }
      if (req.body.kind === 'setActive') {
        const surveyId = surveyIdOf(req.body.surveyId);
        if (!surveyId || typeof req.body.active !== 'boolean') {
          throw new CostError(400, 'INVALID_SURVEY');
        }
        const ref = db.doc(`fst_surveys/${surveyId}`);
        await withLimit(db, actor, 'sv_active', activateLimits, at, async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new CostError(404, 'SURVEY_NOT_FOUND');
          tx.set(ref, { active: req.body.active }, { merge: true });
        }, holdScope);
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

function createFstSurveyAnswerHandler({
  authorize, db, now = Date.now, serverTimestamp, limits = rateOf('fstSurveyAnswer'), holdScope = '',
}) {
  return async function record(req, res) {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    try {
      const actor = await authorize(req);
      rejectUnknown(req.body, ANSWER_FIELDS, 'INVALID_ANSWER');
      const surveyId = surveyIdOf(req.body.surveyId);
      const answer = text(req.body.answer, 2000);
      if (!surveyId || !answer) throw new CostError(400, 'INVALID_ANSWER');
      const at = now();
      const hash = uidHash(actor.uid);
      const ref = db.doc(`fst_survey_answers/${surveyId}_${hash}`);
      await withLimit(db, actor, 'ans', limits, at, async tx => {
        const survey = await tx.get(db.doc(`fst_surveys/${surveyId}`));
        const data = survey.exists ? survey.data() : null;
        if (!data || data.active !== true) throw new CostError(404, 'SURVEY_NOT_FOUND');
        if (data.type === 'options') {
          if (!Array.isArray(data.options) || !data.options.includes(answer)) throw new CostError(400, 'INVALID_ANSWER');
        } else if (data.type !== 'text') {
          throw new CostError(400, 'INVALID_ANSWER');
        }
        const prior = await tx.get(ref);
        if (prior.exists) throw new CostError(409, 'ALREADY_ANSWERED');
        tx.set(ref, { surveyId, uidHash: hash, answer, answeredAt: serverTimestamp() });
      }, holdScope);
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
