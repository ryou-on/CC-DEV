'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../public');
const port = 4173;
const upstream = process.env.FST_E2E_FUNCTION_URL
  || 'http://127.0.0.1:5001/';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function forward(req, res) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const headers = {};
    for (const name of ['authorization', 'content-type', 'x-firebase-appcheck', 'origin']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const body = Buffer.concat(chunks);
    const target = new URL(upstream);
    const call = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: req.method,
      headers: { ...headers, 'content-length': body.length },
    }, up => {
      const out = {};
      for (const name of ['content-type', 'retry-after', 'cache-control']) {
        if (up.headers[name]) out[name] = up.headers[name];
      }
      res.writeHead(up.statusCode || 502, out);
      up.pipe(res);
    });
    call.on('error', error => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    });
    call.end(body);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/fst-feedback') {
    forward(req, res);
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`e2e static ${port}`);
});
