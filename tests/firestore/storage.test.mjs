import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { test, before, after, describe } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadString, getBytes } from 'firebase/storage';

const require = createRequire(import.meta.url);
const { isEditorEmail } = require('../../functions/editor-policy.js');
const editorCases = require('../../functions/editor-policy-cases.json');

let env;
const verified = { email: 'member@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const editorToken = { email: 'someone@splineglobal.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const unverifiedEditorToken = { email: 'someone@splineglobal.com', email_verified: false, firebase: { sign_in_provider: 'google.com' } };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cc-dev-cost',
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: await readFile(new URL('../../storage.rules', import.meta.url), 'utf8'),
    },
  });
});
after(async () => { await env?.cleanup(); });

const storageFor = (uid, token) => env.authenticatedContext(uid, token).storage();
const anonStorage = () => env.authenticatedContext('anon-user', { firebase: { sign_in_provider: 'anonymous' } }).storage();
const publicStorage = () => env.unauthenticatedContext().storage();

describe('storage rules', () => {
  test('group photos reject anonymous auth and non-images', async () => {
    const path = 'groups/FAMILY/pins/p1/photo.jpg';
    await assertFails(uploadString(ref(anonStorage(), path), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertFails(uploadString(ref(storageFor('writer', verified), path), 'txt', 'raw', { contentType: 'text/plain' }));
    await assertSucceeds(uploadString(ref(storageFor('writer', verified), path), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(storageFor('reader', verified), path)));
    await assertFails(getBytes(ref(anonStorage(), path)));
  });

  test('hihaho thumbs are public to read and verified-editor to write', async () => {
    const path = 'hihaho-thumbs/a.jpg';
    await assertFails(uploadString(ref(storageFor('unverified-editor', unverifiedEditorToken), path), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertFails(uploadString(ref(storageFor('writer', verified), path), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertSucceeds(uploadString(ref(storageFor('editor', editorToken), path), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(publicStorage(), path)));
  });

  test('hondoko photos require a verified account to write and stay publicly readable', async () => {
    const path = 'hondoko/shelves/s1.jpg';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), path), 'img', 'raw', { contentType: 'image/jpeg' });
    });
    await assertSucceeds(getBytes(ref(publicStorage(), path)));
    await assertFails(uploadString(ref(anonStorage(), 'hondoko/shelves/new.jpg'), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertFails(uploadString(ref(storageFor('unverified-editor', unverifiedEditorToken), 'hondoko/shelves/new.jpg'), 'img', 'raw', { contentType: 'image/jpeg' }));
    await assertSucceeds(uploadString(ref(storageFor('writer', verified), 'hondoko/shelves/new.jpg'), 'img', 'raw', { contentType: 'image/jpeg' }));
  });

  test('the same editor emails pass or fail for storage and functions', async () => {
    for (const [index, item] of editorCases.entries()) {
      const storage = env.authenticatedContext(`storage-editor-${index}`, {
        email: item.email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).storage();
      const upload = uploadString(ref(storage, `hihaho-thumbs/case-${index}.jpg`), 'img', 'raw', { contentType: 'image/jpeg' });
      if (item.editor) await assertSucceeds(upload);
      else await assertFails(upload);
      assert.equal(isEditorEmail(item.email), item.editor, item.email);
    }
  });

  test('paths outside the named folders are denied', async () => {
    await assertFails(uploadString(ref(storageFor('editor', editorToken), 'secret/note.txt'), 'x', 'raw', { contentType: 'text/plain' }));
    await assertFails(getBytes(ref(publicStorage(), 'secret/note.txt')));
  });
});
