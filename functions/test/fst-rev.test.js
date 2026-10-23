'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FILES, sourceRev } = require('../fst-rev');

test('the deploy label is a stable 32 hex hash of the function sources', () => {
  const rev = sourceRev();
  assert.match(rev, /^[0-9a-f]{32}$/);
  assert.equal(sourceRev(), rev);
  for (const name of [
    'fst-analytics.js', 'fst-feedback.js', 'fst-dev-admin.js',
    'index.js', 'package.json', 'package-lock.json',
  ]) {
    assert.equal(FILES.includes(name), true);
  }
  assert.equal(FILES.includes('fst-rev.js'), false);
  assert.equal(FILES.includes('client-ip.js'), false);
});
