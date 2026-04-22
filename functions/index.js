// ===== note-analytics: Anthropic API CORS プロキシ =====
// ブラウザからの直接呼び出しでは CORS ブロックされるため、
// このFunction を経由して api.anthropic.com に転送する
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'asia-northeast1' });

exports.anthropicProxy = onRequest({
  cors: true,   // Firebase Functions v2 の CORS 自動付与
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (req, res) => {

  // preflight
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) { res.status(400).json({ error: 'x-api-key header required' }); return; }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':        apiKey,
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
        'content-type':     'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});
