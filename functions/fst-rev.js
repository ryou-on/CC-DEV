'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// デプロイ時にラベル fst-rev へ入れる。ゲートは同じファイル列の SHA-256 先頭32桁と照合する。
// このファイル自身は含めない。含めると、照合方法の変更と中身の変更が分かれる。
const FILES = Object.freeze([
  'client-ip.js',
  'cost-guard.js',
  'editor-policy.js',
  'editor-policy.json',
  'fst-analytics.js',
  'fst-dev-admin.js',
  'fst-feedback.js',
]);

function sourceRev(dir = __dirname) {
  const hash = crypto.createHash('sha256');
  for (const name of FILES) {
    hash.update(name);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dir, name)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 32);
}

module.exports = { FILES, sourceRev };

if (require.main === module) {
  process.stdout.write(sourceRev());
}
