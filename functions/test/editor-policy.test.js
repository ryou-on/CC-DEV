'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isEditorEmail } = require('../editor-policy');

const cases = require('../editor-policy-cases.json');

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

test('functions and both rules lowercase the same editor emails', () => {
  const root = path.join(__dirname, '..', '..');
  for (const file of ['firestore.rules', 'storage.rules']) {
    const body = functionBody(fs.readFileSync(path.join(root, file), 'utf8'), 'isHihahoEditor');
    assert.match(body, /request\.auth\.token\.email\.trim\(\)\.lower\(\)\.matches\('\.\*@splineglobal\[\.\]com'\)/);
    assert.match(body, /request\.auth\.token\.email\.trim\(\)\.lower\(\) == 'junpei\.omote@gmail\.com'/);
  }
  const feedback = fs.readFileSync(path.join(__dirname, '..', 'fst-feedback.js'), 'utf8');
  assert.match(feedback, /isEditorEmail/);
  assert.equal(feedback.includes('junpei.omote@gmail.com'), false);
  assert.equal(feedback.includes('@splineglobal.com'), false);
  for (const item of cases) {
    assert.equal(isEditorEmail(item.email), item.editor, item.email);
  }
});
