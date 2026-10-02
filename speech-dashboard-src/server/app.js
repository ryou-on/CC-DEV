import express from 'express';
import multer from 'multer';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { Metadata, MAX_BYTES, EXTENSIONS } from './domain.js';
import { processAudio } from './pipeline.js';
import { createStore, admin } from './store.js';
import { readNameSheet, validateSheet } from './ocr.js';
import { APP } from '../src/meta.js';
export function assertMode(mode) {
  if (!['local', 'cloud'].includes(mode) || (process.env.K_SERVICE && mode !== 'cloud')) throw new Error('UNSAFE_APP_MODE');
}
export function createApp({ mode = process.env.APP_MODE || 'local', store, processor = processAudio, ocr = readNameSheet, authenticate } = {}) {
  assertMode(mode);
  store ??= createStore(mode);
  if (mode === 'cloud') admin();
  const app = express();
  app.disable('x-powered-by'); app.use(express.json({ limit: '12kb' }));
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const origin = req.headers.origin;
    const allowed = mode === 'local' ? ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:8080'] : ['https://cc-dev-ps7.web.app'];
    if (origin && !allowed.includes(origin)) return res.status(403).json({ code: 'ORIGIN_DENIED' });
    if (mode === 'local' && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return res.status(403).json({ code: 'HOST_DENIED' });
    if (origin) res.set({ 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Firebase-AppCheck', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/api/speech/health', (req, res) => res.json({ ok: true, mode, version: APP.version, providers: { openai: !!process.env.OPENAI_API_KEY, jev: !!process.env.JEV_API_KEY } }));
  app.use('/api/speech', async (req, res, next) => {
    try {
      if (authenticate) req.uid = await authenticate(req);
      else if (mode === 'local') req.uid = 'local-user';
      else {
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token || !req.headers['x-firebase-appcheck']) return res.status(401).json({ code: 'AUTH_REQUIRED' });
        const identity = await getAuth().verifyIdToken(token, true);
        if (identity.speechAnalyst !== true) return res.status(403).json({ code: 'ANALYST_REQUIRED' });
        await getAppCheck().verifyToken(req.headers['x-firebase-appcheck']);
        req.uid = identity.uid;
      }
      if (!req.uid) return res.status(401).json({ code: 'AUTH_REQUIRED' });
      next();
    } catch { res.status(401).json({ code: 'AUTH_REQUIRED' }); }
  });
  app.get('/api/speech/recordings', async (req, res) => { res.json({ recordings: await store.list(req.uid) }); });
  let busy = false;
  const upload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, req.tempDir), filename: (req, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()) }), limits: { fileSize: MAX_BYTES, files: 1, fields: 1, fieldSize: 4096 }, fileFilter: (req, file, cb) => cb(EXTENSIONS.has(extname(file.originalname).toLowerCase()) ? null : new Error('INVALID_AUDIO'), true) }).single('file');
  app.post('/api/speech/recordings', async (req, res) => {
    if (busy) return res.status(429).json({ code: 'BUSY' });
    busy = true;
    let directory, responseBody, responseStatus = 200;
    try {
      if (!(await store.limit(req.uid, 'uploads', 20, 3600000))) throw new Error('RATE_LIMIT');
      directory = await mkdtemp(join(tmpdir(), 'speech-')); req.tempDir = directory;
      await new Promise((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
      if (!req.file || req.file.size === 0) throw new Error('INVALID_AUDIO');
      const parsed = Metadata.safeParse(JSON.parse(req.body.metadata || '{}'));
      if (!parsed.success) throw new Error('INVALID_METADATA');
      const meta = parsed.data;
      const id = createHash('sha256').update(req.uid).update(await readFile(req.file.path)).update(JSON.stringify(meta)).digest('hex');
      const previous = (await store.list(req.uid)).find(r => r.id === id);
      if (previous?.status === 'complete') responseBody = { recording: previous, duplicate: true };
      else {
        const result = await processor(req.file.path, meta, directory);
        const recording = { ...result, id, updatedAt: new Date().toISOString() };
        if (Buffer.byteLength(JSON.stringify(recording)) > 750000) throw new Error('RESULT_TOO_LARGE');
        await store.put(req.uid, recording);
        responseStatus = previous ? 200 : 201; responseBody = { recording };
      }
    } catch (error) {
      const codes = ['INVALID_AUDIO', 'INVALID_DURATION', 'INVALID_METADATA', 'RATE_LIMIT', 'TOO_MANY_UTTERANCES', 'RESULT_TOO_LARGE'];
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : codes.includes(error.message) ? error.message : error instanceof SyntaxError ? 'INVALID_METADATA' : 'PROCESSING_FAILED';
      console.error(JSON.stringify({ event: code }));
      responseStatus = code === 'FILE_TOO_LARGE' ? 413 : code === 'RATE_LIMIT' ? 429 : code === 'PROCESSING_FAILED' ? 500 : 400;
      responseBody = { code };
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
      busy = false;
    }
    res.status(responseStatus).json(responseBody);
  });
  const uploadSheet = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16 } }).single('file');
  app.post('/api/speech/photo-names', async (req, res) => {
    if (busy) return res.status(429).json({ code: 'BUSY' });
    busy = true;
    let directory, status = 200, body;
    try {
      if (!(await store.limit(req.uid, 'ocr', 20, 3600000))) throw new Error('RATE_LIMIT');
      await new Promise((resolve, reject) => uploadSheet(req, res, e => e ? reject(e) : resolve()));
      const count = Number(req.body?.count);
      if (!req.file || !validateSheet(req.file.buffer, count)) throw new Error('INVALID_OCR_IMAGE');
      directory = await mkdtemp(join(tmpdir(), 'speech-ocr-'));
      const path = join(directory, 'labels.png'); await writeFile(path, req.file.buffer);
      body = { labels: await ocr(path, count) };
    } catch (error) {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : ['RATE_LIMIT', 'INVALID_OCR_IMAGE'].includes(error.message) ? error.message : 'OCR_UNAVAILABLE';
      status = code === 'RATE_LIMIT' ? 429 : code === 'FILE_TOO_LARGE' ? 413 : code === 'INVALID_OCR_IMAGE' ? 400 : 503;
      body = { code };
    } finally { if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {}); busy = false; }
    res.status(status).json(body);
  });
  app.post('/api/speech/feedback', async (req, res) => {
    const { message, startedAt, website, appId, version, url } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 2000 || website || !Number.isFinite(startedAt) || Date.now() - startedAt < 3000 || appId !== APP.id || version !== APP.version || url !== APP.url) return res.status(400).json({ code: 'INVALID_FEEDBACK' });
    if (!(await store.limit(req.uid, 'feedback-minute', 5, 60000)) || !(await store.limit(req.uid, 'feedback-day', 50, 86400000))) return res.status(429).json({ code: 'RATE_LIMIT' });
    const hash = createHash('sha256').update(message.trim()).digest('hex');
    if (!(await store.limit(req.uid, `feedback-${hash}`, 1, 300000))) return res.status(429).json({ code: 'DUPLICATE_FEEDBACK' });
    const feedbackId = await store.feedback(req.uid, { message: message.trim(), appId: APP.id, version: APP.version, url: APP.url });
    res.status(201).json({ ok: true, feedbackId });
  });
  app.post('/api/speech/analytics', async (req, res) => {
    if (!(await store.limit(req.uid, 'analytics', 10, 60000))) return res.status(429).json({ code: 'RATE_LIMIT' });
    await store.analytics(req.uid); res.json({ ok: true });
  });
  app.use((error, req, res, next) => { console.error(JSON.stringify({ event: 'SERVER_ERROR' })); res.status(500).json({ code: 'SERVER_ERROR' }); });
  return app;
}
