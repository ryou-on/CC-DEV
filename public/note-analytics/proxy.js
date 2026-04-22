#!/usr/bin/env node
// ===== note-analytics ローカルプロキシサーバー =====
// Claude Vision API の CORS 問題を回避するため、
// このスクリプトをローカルで起動してからブラウザで使用する
//
// 起動方法: node proxy.js
// 停止方法: Ctrl+C
// 依存: Node.js 標準ライブラリのみ（npm install 不要）

const http  = require('http');
const https = require('https');

const PORT = 3001;
const TARGET_HOST = 'api.anthropic.com';

const server = http.createServer((req, res) => {
  // CORS ヘッダーを全レスポンスに付与
  res.setHeader('Access-Control-Allow-Origin', 'https://cc-dev-ps7.web.app');
  res.setHeader('Access-Control-Allow-Origin', '*'); // 開発用に全許可
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-calls');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ヘルスチェック
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, proxy: 'note-analytics-local-proxy' }));
    return;
  }

  // Anthropic API へ転送
  const path = req.url.startsWith('/v1/') ? req.url : `/v1${req.url}`;
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path,
      method: req.method,
      headers: {
        'content-type':      req.headers['content-type'] || 'application/json',
        'x-api-key':         req.headers['x-api-key'] || '',
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      },
    };

    const proxyReq = https.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, {
        'content-type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error('Proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 note-analytics ローカルプロキシ起動`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n📌 このターミナルを開いたまま、ブラウザで`);
  console.log(`   https://cc-dev-ps7.web.app/note-analytics/ を開いてください`);
  console.log(`\n   停止: Ctrl+C\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ ポート ${PORT} は既に使用中です。別のプロキシが起動中かもしれません。`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
