'use strict';

// Outside functions/. The cost gate rejects these writes under functions/.
// All four E2E conditions are set before the handlers load.
delete process.env.K_SERVICE;
delete process.env.FUNCTION_TARGET;
delete process.env.K_REVISION;
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.FST_E2E_EMULATOR = '1';
process.env.FST_APPCHECK_DEBUG_TOKEN = process.env.FST_APPCHECK_DEBUG_TOKEN || 'fst-e2e-debug-token';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-cc-dev-fst-e2e';
process.env.GCP_PROJECT = 'demo-cc-dev-fst-e2e';
process.env.GOOGLE_CLOUD_PROJECT = 'demo-cc-dev-fst-e2e';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-cc-dev-fst-e2e' });

const http = require('node:http');
const admin = require('../../functions/node_modules/firebase-admin');
const { createFstFeedbackHandler } = require('../../functions/fst-feedback');
const { getGuard } = require('../../functions/cost-guard');

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-cc-dev-fst-e2e' });
const handler = createFstFeedbackHandler({
  authorize: request => getGuard().authorize(request, 'fstFeedback'),
  db: admin.firestore(),
  serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
});

function read(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const raw = await read(req);
  req.rawBody = raw;
  try {
    req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch (error) {
    req.body = {};
  }
  req.get = name => req.headers[String(name).toLowerCase()];
  res.set = (name, value) => { res.setHeader(name, value); return res; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = body => { res.end(body == null ? '' : body); return res; };
  try {
    await handler(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'COST_GUARD_UNAVAILABLE' }));
    }
  }
});

server.listen(5001, '127.0.0.1', () => {
  console.log('e2e function host 5001');
});
