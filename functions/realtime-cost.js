'use strict';

const MAX_CALL_SECONDS = 300;
const CALL_ID = /^[A-Za-z0-9_-]{1,160}$/;
const BASE = 'https://api.openai.com/v1/realtime/calls/';

function callIdFromLocation(location) {
  if (!location) throw new Error('MISSING_CALL_LOCATION');
  const url = new URL(location, BASE);
  if (url.origin !== 'https://api.openai.com' || !url.pathname.startsWith('/v1/realtime/calls/') || url.search || url.hash) {
    throw new Error('INVALID_CALL_LOCATION');
  }
  const id = url.pathname.slice('/v1/realtime/calls/'.length);
  if (!CALL_ID.test(id)) throw new Error('INVALID_CALL_ID');
  return id;
}

async function hangup(callId, apiKey, fetchImpl = fetch) {
  if (!CALL_ID.test(callId)) throw new Error('INVALID_CALL_ID');
  const r = await fetchImpl(BASE + callId + '/hangup', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error('HANGUP_FAILED');
}

// Never hand the SDP to a browser before the durable shutdown task is accepted.
async function armExpiry({ location, uid, db, enqueue, apiKey, now = Date.now, fetchImpl = fetch }) {
  const callId = callIdFromLocation(location);
  const expiresAtMs = now() + MAX_CALL_SECONDS * 1000;
  try {
    await db.doc(`costRealtimeCalls/${callId}`).set({ uid, expiresAtMs, closed: false });
    await enqueue({ callId }, { scheduleTime: new Date(expiresAtMs), dispatchDeadlineSeconds: 30 });
  } catch (e) {
    await hangup(callId, apiKey, fetchImpl);
    throw new Error('EXPIRY_NOT_ARMED');
  }
  return { callId, expiresAtMs };
}

async function expireCall({ data, db, apiKey, now = Date.now, fetchImpl = fetch }) {
  if (!data || !CALL_ID.test(data.callId || '')) throw new Error('INVALID_CALL_ID');
  const ref = db.doc(`costRealtimeCalls/${data.callId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().closed === true) return;
  const deadline = snap.data().expiresAtMs;
  if (!Number.isSafeInteger(deadline) || now() < deadline) throw new Error('NOT_DUE');
  await hangup(data.callId, apiKey, fetchImpl);
  await ref.update({ closed: true, closedAtMs: now(), expiresAt: new Date(now() + 7 * 86400000) });
}

module.exports = { MAX_CALL_SECONDS, callIdFromLocation, armExpiry, expireCall, hangup };
