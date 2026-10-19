'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { policy, isEditorEmail } = require('../editor-policy');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function rulesPattern(suffix) {
  return `.*${suffix.replace(/\./g, '[.]')}`;
}

test('firestore and storage editor functions match the shared policy', () => {
  const root = path.join(__dirname, '..', '..');
  const expectedPattern = rulesPattern(policy.domainSuffix);
  for (const file of ['firestore.rules', 'storage.rules']) {
    const body = functionBody(fs.readFileSync(path.join(root, file), 'utf8'), 'isHihahoEditor');
    assert.match(body, new RegExp(expectedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const email of policy.emails) {
      assert.match(body, new RegExp(`request\\.auth\\.token\\.email == '${email}'`));
    }
    const literals = [...body.matchAll(/'([^']+)'/g)].map(match => match[1]);
    const emails = literals.filter(item => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(item));
    assert.deepEqual(emails.sort(), [...policy.emails].sort());
  }
});

test('functions use the policy and do not keep a second email list', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'fst-feedback.js'), 'utf8');
  assert.match(source, /isEditorEmail/);
  assert.equal(source.includes('junpei.omote@gmail.com'), false);
  assert.equal(source.includes('@splineglobal.com'), false);
  assert.equal(isEditorEmail('Junpei.Omote@gmail.com'), true);
  assert.equal(isEditorEmail('person@splineglobal.com'), true);
  assert.equal(isEditorEmail('person@splineglobal.com.evil'), false);
  assert.equal(isEditorEmail('person@example.com'), false);
  assert.equal(isEditorEmail(''), false);
});

test('rules stay case-sensitive because the rules language has no lowercase', () => {
  const body = functionBody(fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), 'isHihahoEditor');
  assert.equal(body.toLowerCase().includes('lower'), false);
  assert.equal(isEditorEmail(policy.emails[0].toUpperCase()), true);
});
