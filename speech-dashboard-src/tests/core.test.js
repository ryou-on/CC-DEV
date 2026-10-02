import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Metadata, activeIntervals, makeUtterances, assignText } from '../server/domain.js';
import { summarize, totals, timelineGroups } from '../src/metrics.js';
import { classify, parseJev, transcribe } from '../server/providers.js';
import { processAudio } from '../server/pipeline.js';
import { assertMode } from '../server/app.js';
const meta = { speaker: 'A', day: 'Day 1', session: 'work1', kind: 'Room', room: 'Room A', start: 0, end: '', offset: 0 };
test('intervals: silence-only, none, short gaps and no silence inflation', () => {
  assert.deepEqual(activeIntervals('silence_start: 0\nsilence_end: 5', 5), []);
  assert.deepEqual(activeIntervals('', 5), [[0, 5]]);
  assert.deepEqual(activeIntervals('silence_start: 2\nsilence_end: 3\nsilence_start: 4', 5), [[0, 2], [3, 4]]);
  const utterances = makeUtterances([[0, 2], [2.5, 3.5], [5, 6]], 10);
  assert.equal(utterances.length, 2); assert.equal(utterances[0].speechSeconds, 3); assert.equal(utterances[0].end, 13.5);
});
test('metrics retain silence participants, overlap and a stable denominator', () => {
  const recordings = [{ ...meta, utterances: [{ start: 0, end: 10, speechSeconds: 10 }] }, { ...meta, speaker: 'B', utterances: [{ start: 0, end: 5, speechSeconds: 5 }] }, { ...meta, speaker: 'C', utterances: [] }];
  const result = summarize(recordings);
  assert.equal(result.length, 3); assert.ok(Math.abs(result[0].share - 100 * 10 / 15) < 1e-9); assert.equal(result[2].average, 0);
  assert.equal(totals(recordings).seconds, 15); assert.deepEqual(totals([]), { seconds: 0, count: 0, average: 0, people: 0 });
  assert.equal(timelineGroups([...recordings, { ...meta, day: 'Day 2', utterances: [] }]).length, 2);
});
test('validation rejects invalid windows, blank names and negative aligned time', () => {
  assert.equal(Metadata.safeParse(meta).success, true);
  for (const patch of [{ speaker: ' ' }, { end: 601 }, { end: 3, start: 4 }, { offset: -1 }, { day: '1' }]) assert.equal(Metadata.safeParse({ ...meta, ...patch }).success, false);
  assert.equal(Metadata.parse({ ...meta, kind: 'Main', room: 'A' }).room, 'Main');
});
test('transcript segment assigned once to largest overlap with timeline offset', () => {
  const result = assignText(makeUtterances([[0, 2], [3, 9]], 10), [{ start: 0, end: 8, text: 'hello' }], 10);
  assert.equal(result[0].text, ''); assert.equal(result[1].text, 'hello');
});
const response = { model: 'jev-test', answers: { speech_type: { choice: 'proposal', confidence: .9 }, initiative: { score: 3.25, confidence: .4 }, question: { noul: .15 } } };
test('Jev contract preserves fractional score, confidence and Noul', async () => {
  const result = await classify('提案です', { key: 'test-key', fetcher: async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(options.body); assert.equal(Object.keys(body.questions.speech_type.criteria).length, 9);
    assert.equal(body.questions.initiative.criteria.length, 5);
    return { ok: true, json: async () => response };
  } });
  assert.equal(result.score, 3.25); assert.equal(result.type, '提案'); assert.equal(result.review, true); assert.equal(result.questionProbability, .15);
  assert.throws(() => parseJev({ answers: {} }));
  await assert.rejects(classify('test', { key: 'test', fetcher: async () => ({ ok: false }) }), /PROVIDER_FAILED/);
});
test('unsafe Cloud Run local mode fails closed', () => {
  const previous = process.env.K_SERVICE; process.env.K_SERVICE = 'test';
  assert.throws(() => assertMode('local'), /UNSAFE/); assert.doesNotThrow(() => assertMode('cloud'));
  if (previous === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = previous;
});
test('actual FFmpeg: two tones + silence, provider partial failure and OpenAI form', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'speech-test-'));
  try {
    const file = join(directory, 'fixture.wav');
    await promisify(execFile)('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-af', "volume=0:enable='between(t,1,3)'", '-ar', '16000', file]);
    const providers = { transcribe: async () => [{ start: 0, end: 1, text: 'first' }, { start: 3, end: 5, text: 'second' }], classify: async () => parseJev(response) };
    const result = await processAudio(file, { ...meta, offset: 10 }, directory, providers);
    assert.equal(result.utterances.length, 2); assert.ok(Math.abs(totals([result]).seconds - 3) < .1); assert.equal(result.status, 'complete');
    assert.equal(result.utterances[0].start, 10);
    const partial = await processAudio(file, meta, directory, { transcribe: async () => { throw new Error('unavailable'); }, classify: providers.classify });
    assert.equal(partial.status, 'partial'); assert.ok(partial.utterances.every(u => u.analysis === null));
    const transcript = await transcribe(file, { key: 'test', fetcher: async (url, options) => {
      assert.equal(options.body.get('model'), 'whisper-1'); assert.equal(options.body.get('response_format'), 'verbose_json'); assert.equal(options.body.get('timestamp_granularities[]'), 'segment');
      return { ok: true, json: async () => ({ segments: [{ start: 0, end: 1, text: 'hello' }] }) };
    } });
    assert.equal(transcript[0].text, 'hello');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
