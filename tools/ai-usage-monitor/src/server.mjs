// ローカルAPIサーバー（127.0.0.1のみ）: /api/usage, /api/chatgpt, ダッシュボード配信
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll, writeChatgpt, readChatgpt } from './collect.mjs';

const PORT = Number(process.env.AI_USAGE_PORT || 7777);
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
let cache = { t: 0, data: null };

function usage() {
  if (Date.now() - cache.t > 10000) cache = { t: Date.now(), data: collectAll() };
  return cache.data;
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/api/usage') return send(res, 200, usage());
  if (url.pathname === '/api/chatgpt' && req.method === 'GET') return send(res, 200, readChatgpt());
  if (url.pathname === '/api/chatgpt' && req.method === 'POST') {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      try { const r = writeChatgpt(JSON.parse(b || '{}')); cache.t = 0; send(res, 200, r); }
      catch (e) { send(res, 400, { error: String(e.message) }); }
    });
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'), 'text/html');
  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`AI Usage Monitor: http://127.0.0.1:${PORT}`));
