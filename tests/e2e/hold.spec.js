'use strict';

const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const shotDir = process.env.FST_E2E_SHOT_DIR;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__FST_E2E_EMULATOR = '1';
    window.__FST_APPCHECK_DEBUG_TOKEN = 'fst-e2e-debug-token';
  });
});

test('a 429 stops the send button until the retry window ends', async ({ page }) => {
  test.skip(process.env.FST_E2E_EMULATOR !== '1', 'FST_E2E_EMULATOR=1 のときだけ Auth エミュレーターへ切り替える');
  await page.goto('/Flight_Strip_TODO_dev/');
  await page.getByRole('button', { name: 'SIGN IN WITH GOOGLE' }).waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    await firebase.auth().signInWithEmailAndPassword('e2e-fst@example.test', 'e2e-password-1');
  });
  await page.getByText('[フィードバック]', { exact: true }).evaluate(el => el.click());
  await page.getByPlaceholder('例：タスク追加時の不具合について').fill('E2Eの件名');
  await page.getByPlaceholder('ご意見・ご要望・不具合報告など').fill('E2Eの本文は残る');
  await page.waitForTimeout(1600);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'seed.cjs')], { stdio: 'inherit' });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('seed ' + code))));
  });
  const send = page.getByRole('button', { name: '送信', exact: true });
  await send.click();
  await expect(page.getByText('送信回数の上限です。時間をおいて再試行してください')).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(page.getByPlaceholder('例：タスク追加時の不具合について')).toHaveValue('E2Eの件名');
  await expect(page.getByPlaceholder('ご意見・ご要望・不具合報告など')).toHaveValue('E2Eの本文は残る');
  await page.screenshot({ path: path.join(shotDir, 'e2e-429-button-paused.png') });
  await expect(send).toBeEnabled();
  await expect(page.getByPlaceholder('例：タスク追加時の不具合について')).toHaveValue('E2Eの件名');
  await expect(page.getByPlaceholder('ご意見・ご要望・不具合報告など')).toHaveValue('E2Eの本文は残る');
  await page.screenshot({ path: path.join(shotDir, 'e2e-429-button-restored.png') });
});
