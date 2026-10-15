'use strict';

const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');

// Flight Strip の目安箱。クライアントの Firestore 直書きは受けない。
// 有料APIの costControls 許可リストとは別で、確認済み利用者なら送れる。
const ORIGINS = new Set(['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com']);
const APPS = new Set(['flight-strip-todo', 'flight-strip-todo-dev']);
const TYPES = new Set(['request', 'bug', 'question', 'other']);
const STATUSES = new Set(['unreviewed', 'reviewed', 'in_progress', 'resolved']);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]{1,20})?$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,120}$/;
const MINUTE_LIMIT = 5;
const DAY_LIMIT = 50;
const DUP_WINDOW_MS = 10 * 60 * 1000;
const MIN_FILL_MS = 1500;
const MAX_BODY = 16000;
const SUBMIT_FIELDS = new Set(['appId', 'version', 'url', 'subject', 'message', 'email', 'type', 'build', 'faxNumber', 'openedAtMs']);
const UPDATE_FIELDS = new Set(['feedbackId', 'status', 'replyText', 'replySent']);

class FeedbackError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'FeedbackError';
    this.httpStatus = status;
    this.code = code;
  }
}

function editorEmail(email) {
  const value = String(email || '').toLowerCase();
  return value === 'junpei.omote@gmail.com' || value.endsWith('@splineglobal.com');
}

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function rejectUnknown(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new FeedbackError(400, 'INVALID_BODY');
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new FeedbackError(400, 'UNKNOWN_FIELD');
  }
}

function requireText(value, min, max, code) {
  if (typeof value !== 'string') throw new FeedbackError(400, code);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new FeedbackError(400, code);
  return text;
}

function normalizeUrl(raw) {
  let url;
  try { url = new URL(raw); }
  catch { throw new FeedbackError(400, 'INVALID_URL'); }
  if (url.protocol !== 'https:' || !ORIGINS.has(url.origin)) throw new FeedbackError(400, 'INVALID_URL');
  url.search = '';
  url.hash = '';
  const out = url.toString();
  if (out.length > 2048) throw new FeedbackError(400, 'INVALID_URL');
  return out;
}

function validateSubmission(body, now) {
  rejectUnknown(body, SUBMIT_FIELDS);
  if (hasOwn(body, 'faxNumber') && body.faxNumber !== '') throw new FeedbackError(400, 'REJECTED');
  if (!Number.isSafeInteger(body.openedAtMs)) throw new FeedbackError(400, 'INVALID_TIMING');
  const elapsed = now - body.openedAtMs;
  if (elapsed < MIN_FILL_MS || elapsed > 24 * 60 * 60 * 1000) throw new FeedbackError(400, 'INVALID_TIMING');
  if (!APPS.has(body.appId)) throw new FeedbackError(400, 'INVALID_APP');
  const version = requireText(body.version, 1, 50, 'INVALID_VERSION');
  if (!SEMVER.test(version)) throw new FeedbackError(400, 'INVALID_VERSION');
  const url = normalizeUrl(body.url);
  const subject = requireText(body.subject, 1, 200, 'INVALID_SUBJECT');
  const message = requireText(body.message, 1, 2000, 'INVALID_MESSAGE');
  let email = '';
  if (hasOwn(body, 'email') && body.email !== '') {
    email = requireText(body.email, 3, 200, 'INVALID_EMAIL');
    if (!EMAIL.test(email)) throw new FeedbackError(400, 'INVALID_EMAIL');
  }
  let type;
  if (hasOwn(body, 'type')) {
    if (!TYPES.has(body.type)) throw new FeedbackError(400, 'INVALID_TYPE');
    type = body.type;
  }
  if (body.build !== 'stable' && body.build !== 'dev') throw new FeedbackError(400, 'INVALID_BUILD');
  if ((body.appId === 'flight-strip-todo') !== (body.build === 'stable')) throw new FeedbackError(400, 'INVALID_BUILD');
  return { appId: body.appId, version, url, subject, message, email, type, build: body.build };
}

function validateUpdate(body) {
  rejectUnknown(body, UPDATE_FIELDS);
  const feedbackId = requireText(body.feedbackId, 7, 20, 'INVALID_ID');
  if (!/^FB_\d{4,6}$/.test(feedbackId)) throw new FeedbackError(400, 'INVALID_ID');
  if (!STATUSES.has(body.status)) throw new FeedbackError(400, 'INVALID_STATUS');
  const patch = { status: body.status };
  if (hasOwn(body, 'replyText')) {
    if (typeof body.replyText !== 'string' || body.replyText.length > 2000) throw new FeedbackError(400, 'INVALID_REPLY');
    patch.replyText = body.replyText.trim();
  }
  if (hasOwn(body, 'replySent')) {
    if (typeof body.replySent !== 'boolean') throw new FeedbackError(400, 'INVALID_REPLY');
    patch.replySent = body.replySent;
  }
  return { feedbackId, patch };
}

function periodKeys(now) {
  const jst = new Date(now + 9 * 60 * 60 * 1000).toISOString();
  return { minute: Math.floor(now / 60000), day: jst.slice(0, 10) };
}

function contentHash(message) {
  return crypto.createHash('sha256').update(message.replace(/\s+/g, ' ').trim()).digest('hex');
}

function nextRate(prev, now, hash) {
  const keys = periodKeys(now);
  const minuteCount = prev && prev.minuteKey === keys.minute && Number.isSafeInteger(prev.minuteCount) ? prev.minuteCount : 0;
  const dayCount = prev && prev.dayKey === keys.day && Number.isSafeInteger(prev.dayCount) ? prev.dayCount : 0;
  if (minuteCount >= MINUTE_LIMIT || dayCount >= DAY_LIMIT) throw new FeedbackError(429, 'RATE_LIMIT');
  if (prev && prev.lastHash === hash && Number.isSafeInteger(prev.lastAtMs) && now - prev.lastAtMs < DUP_WINDOW_MS) {
    throw new FeedbackError(429, 'DUPLICATE');
  }
  return {
    minuteKey: keys.minute,
    minuteCount: minuteCount + 1,
    dayKey: keys.day,
    dayCount: dayCount + 1,
    lastHash: hash,
    lastAtMs: now,
    expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
  };
}

function uidHash(uid) {
  return crypto.createHash('sha256').update(String(uid)).digest('hex');
}

async function authorize(req, deps, editor) {
  const size = Buffer.isBuffer(req.rawBody) ? req.rawBody.length : Buffer.byteLength(JSON.stringify(req.body || {}));
  if (size > MAX_BODY) throw new FeedbackError(413, 'BODY_TOO_LARGE');
  const type = req.get('content-type') || '';
  if (!type.includes('application/json')) throw new FeedbackError(415, 'INVALID_CONTENT_TYPE');
  const origin = req.get('origin');
  if (origin && !ORIGINS.has(origin)) throw new FeedbackError(403, 'ORIGIN_DENIED');
  const bearer = req.get('authorization') || '';
  if (!/^Bearer [^\s]{1,8192}$/.test(bearer)) throw new FeedbackError(401, 'SIGN_IN_REQUIRED');
  let user;
  try { user = await deps.verifyIdToken(bearer.slice(7)); }
  catch { throw new FeedbackError(401, 'INVALID_ID_TOKEN'); }
  if (!user || !user.uid || user.email_verified !== true || user.firebase?.sign_in_provider === 'anonymous') {
    throw new FeedbackError(403, 'VERIFIED_ACCOUNT_REQUIRED');
  }
  if (editor && !editorEmail(user.email)) throw new FeedbackError(403, 'EDITOR_REQUIRED');
  const attestation = req.get('x-firebase-appcheck');
  if (!attestation || attestation.length > 8192) throw new FeedbackError(403, 'APP_CHECK_REQUIRED');
  try { await deps.verifyAppCheck(attestation); }
  catch { throw new FeedbackError(403, 'INVALID_APP_CHECK'); }
  return { uid: user.uid, email: String(user.email || '').toLowerCase() };
}

function rethrow(error) {
  if (error instanceof FeedbackError) throw error;
  throw new FeedbackError(503, 'UNAVAILABLE');
}

function createFeedbackApi(deps) {
  const now = deps.now || Date.now;
  const stamp = deps.timestamp || (at => new Date(at));

  async function submit(req) {
    const actor = await authorize(req, deps, false);
    const at = now();
    const input = validateSubmission(req.body, at);
    const hash = contentHash(input.message);
    const rateRef = deps.db.doc('fst_feedback_limits/' + uidHash(actor.uid));
    const counterRef = deps.db.doc('fst_feedback_meta/counter');
    let feedbackId;
    try {
      await deps.db.runTransaction(async tx => {
        const [rateSnap, counterSnap] = await tx.getAll(rateRef, counterRef);
        const rate = nextRate(rateSnap.exists ? rateSnap.data() : null, at, hash);
        const count = counterSnap.exists ? counterSnap.data()?.count : 0;
        if (!Number.isSafeInteger(count) || count < 0 || count >= 999999) throw new FeedbackError(503, 'COUNTER_UNAVAILABLE');
        const next = count + 1;
        feedbackId = 'FB_' + String(next).padStart(4, '0');
        const doc = {
          feedbackId,
          fbId: feedbackId,
          appId: input.appId,
          version: input.version,
          url: input.url,
          subject: input.subject,
          message: input.message,
          email: input.email,
          build: input.build,
          uid: actor.uid,
          status: 'unreviewed',
          replySent: false,
          createdAt: stamp(at),
        };
        if (input.type) doc.type = input.type;
        tx.set(rateRef, rate);
        tx.set(counterRef, { count: next });
        tx.set(deps.db.doc('fst_feedback/' + feedbackId), doc);
      });
    } catch (error) { rethrow(error); }
    return { ok: true, feedbackId };
  }

  async function update(req) {
    const actor = await authorize(req, deps, true);
    const { feedbackId, patch } = validateUpdate(req.body || {});
    const ref = deps.db.doc('fst_feedback/' + feedbackId);
    try {
      await deps.db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new FeedbackError(404, 'NOT_FOUND');
        const current = snap.data() || {};
        const keep = {};
        for (const key of ['uid', 'message', 'appId', 'email', 'subject']) {
          if (current[key] !== undefined) keep[key] = current[key];
        }
        tx.update(ref, { ...patch, updatedAt: stamp(now()), updatedBy: uidHash(actor.uid), ...keep });
      });
    } catch (error) { rethrow(error); }
    return { ok: true, feedbackId };
  }

  return { submit, update };
}

function sendJson(res, status, body, requestId) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Request-Id', requestId);
  if (status === 429) res.set('Retry-After', '60');
  res.status(status).json(body);
}

function createHttpHandler(api, action) {
  return async (req, res) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    const origin = req.get('origin');
    if (origin && ORIGINS.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' }, requestId); return; }
    try {
      const result = await api[action](req);
      sendJson(res, 200, result, requestId);
    } catch (error) {
      const status = error instanceof FeedbackError ? error.httpStatus : 503;
      const code = error instanceof FeedbackError ? error.code : 'UNAVAILABLE';
      console.error(JSON.stringify({ action, result: code, status, requestId }));
      sendJson(res, status, { error: code }, requestId);
    }
  };
}

function productionApi() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  return createFeedbackApi({
    db: admin.firestore(),
    verifyIdToken: token => admin.auth().verifyIdToken(token, true),
    verifyAppCheck: token => admin.appCheck().verifyToken(token),
    timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  });
}

let singleton;
function apiOnce() {
  if (!singleton) singleton = productionApi();
  return singleton;
}

const endpoint = { cors: false, timeoutSeconds: 20, memory: '256MiB', maxInstances: 2, concurrency: 8 };
exports.submitFstFeedback = onRequest(endpoint, (req, res) => createHttpHandler(apiOnce(), 'submit')(req, res));
exports.updateFstFeedback = onRequest(endpoint, (req, res) => createHttpHandler(apiOnce(), 'update')(req, res));

module.exports = {
  FeedbackError,
  validateSubmission,
  validateUpdate,
  nextRate,
  contentHash,
  createFeedbackApi,
  createHttpHandler,
  editorEmail,
  MINUTE_LIMIT,
  DAY_LIMIT,
  submitFstFeedback: exports.submitFstFeedback,
  updateFstFeedback: exports.updateFstFeedback,
};
