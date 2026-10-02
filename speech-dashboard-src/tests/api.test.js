import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { APP } from '../src/meta.js';
const meta = { speaker: 'A', day: 'Day 1', session: 'work1', kind: 'Main', room: 'Main', start: 0, end: '', offset: 0 };
async function serve(app, fn) { const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
function form(metadata = meta, size = 3) { const body = new FormData(); body.set('file', new Blob([new Uint8Array(size)]), 'test.wav'); body.set('metadata', JSON.stringify(metadata)); return body; }
test('upload ownership, deduplication, validation and feedback limits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'speech-api-')); let count = 0;
  try {
    const store = createStore('local', directory);
    const processor = async (file, data) => { count++; return { ...data, status: 'complete', utterances: [], duration: 1 }; };
    await serve(createApp({ store, processor }), async base => {
      const first = await fetch(`${base}/api/speech/recordings`, { method: 'POST', body: form() }); assert.equal(first.status, 201);
      const second = await fetch(`${base}/api/speech/recordings`, { method: 'POST', body: form() }); assert.equal((await second.json()).duplicate, true); assert.equal(count, 1);
      const list = await (await fetch(`${base}/api/speech/recordings`)).json(); assert.equal(list.recordings.length, 1);
      const invalid = await fetch(`${base}/api/speech/recordings`, { method: 'POST', body: form({ ...meta, speaker: '' }) }); assert.equal(invalid.status, 400);
      const hostile = await fetch(`${base}/api/speech/recordings`, { headers: { Origin: 'https://evil.invalid' } }); assert.equal(hostile.status, 403);
      const feedback = { message: 'テストの要望', startedAt: Date.now() - 4000, website: '', appId: APP.id, version: APP.version, url: APP.url };
      const send = () => fetch(`${base}/api/speech/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feedback) });
      assert.equal((await send()).status, 201); assert.equal((await send()).status, 429);
    });
    await serve(createApp({ store, authenticate: async () => { throw new Error('invalid token'); } }), async base => {
      assert.equal((await fetch(`${base}/api/speech/recordings`)).status, 401);
    });
    const fresh = createStore('local', directory); assert.equal((await fresh.list('local-user')).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('partial result can be retried without duplicate records, oversized file is rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'speech-retry-')); let count = 0;
  try {
    const store = createStore('local', directory);
    await serve(createApp({ store, processor: async (file, data) => ({ ...data, status: ++count === 1 ? 'partial' : 'complete', utterances: [] }) }), async base => {
      const first = await (await fetch(`${base}/api/speech/recordings`, { method: 'POST', body: form() })).json(); assert.equal(first.recording.status, 'partial');
      const second = await (await fetch(`${base}/api/speech/recordings`, { method: 'POST', body: form() })).json(); assert.equal(second.recording.status, 'complete');
      assert.equal((await store.list('local-user')).length, 1);
      assert.equal((await fetch(`${base}/api/speech/recordings`, { method: 'POST', body: form(meta, 21 * 1024 * 1024) })).status, 413);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('cloud endpoints reject missing identity and answer only allowed CORS preflight', async () => {
  const store = { list: async () => { throw new Error('Must not access store'); } };
  await serve(createApp({ mode: 'cloud', store }), async base => {
    const denied = await fetch(`${base}/api/speech/recordings`); assert.equal(denied.status, 401);
    const preflight = await fetch(`${base}/api/speech/recordings`, { method: 'OPTIONS', headers: { Origin: 'https://cc-dev-ps7.web.app' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://cc-dev-ps7.web.app');
    assert.equal((await fetch(`${base}/api/speech/recordings`, { method: 'OPTIONS', headers: { Origin: 'https://other.invalid' } })).status, 403);
  });
});
