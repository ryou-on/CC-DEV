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

function seed(mode, email) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'seed.cjs')], {
      stdio: 'inherit',
      env: { ...process.env, FST_E2E_SEED: mode, FST_E2E_EMAIL: email },
    });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('seed ' + code))));
  });
}

async function openFeedback(page, email) {
  await page.goto('/Flight_Strip_TODO_dev/');
  await page.getByRole('button', { name: 'SIGN IN WITH GOOGLE' }).waitFor({ timeout: 60000 });
  await page.evaluate(async address => {
    await firebase.auth().signInWithEmailAndPassword(address, 'e2e-password-1');
  }, email);
  await page.getByText('[フィードバック]', { exact: true }).evaluate(el => el.click());
  await page.getByPlaceholder('例：タスク追加時の不具合について').fill('E2Eの件名');
  await page.getByPlaceholder('ご意見・ご要望・不具合報告など').fill('E2Eの本文は残る');
  await page.waitForTimeout(1600);
}

async function expectHold(page, message, pausedShot, restoredShot) {
  const subject = page.getByPlaceholder('例：タスク追加時の不具合について');
  const body = page.getByPlaceholder('ご意見・ご要望・不具合報告など');
  const waiting = page.getByRole('button', { name: /あと\d+秒/ });
  await expect(page.getByText(message)).toBeVisible();
  await expect(waiting).toBeDisabled();
  await expect(waiting).toHaveCSS('background-color', 'rgb(92, 99, 112)');
  await expect(waiting).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(subject).toHaveValue('E2Eの件名');
  await expect(body).toHaveValue('E2Eの本文は残る');
  await page.screenshot({ path: path.join(shotDir, pausedShot) });
  const restored = page.getByRole('button', { name: '送信', exact: true });
  await expect(restored).toBeEnabled();
  await expect(subject).toHaveValue('E2Eの件名');
  await expect(body).toHaveValue('E2Eの本文は残る');
  await expect(page.getByText(message)).toBeVisible();
  await page.screenshot({ path: path.join(shotDir, restoredShot) });
}

test('a 429 stops the send button until the retry window ends', async ({ page }) => {
  test.skip(process.env.FST_E2E_EMULATOR !== '1', 'FST_E2E_EMULATOR=1 のときだけ Auth エミュレーターへ切り替える');
  await seed('cap', 'e2e-fst@example.test');
  await openFeedback(page, 'e2e-fst@example.test');
  await seed('cap', 'e2e-fst@example.test');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expectHold(
    page,
    '送信回数の上限です。時間をおいて再試行してください',
    'e2e-429-button-paused.png',
    'e2e-429-button-restored.png',
  );
});

test('a paused budget stops the send button with the service paused message', async ({ page }) => {
  test.skip(process.env.FST_E2E_EMULATOR !== '1', 'FST_E2E_EMULATOR=1 のときだけ Auth エミュレーターへ切り替える');
  await seed('paused', 'e2e-paused@example.test');
  await openFeedback(page, 'e2e-paused@example.test');
  await seed('paused', 'e2e-paused@example.test');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expectHold(
    page,
    '予算停止中のため送信できません',
    'e2e-paused-button-paused.png',
    'e2e-paused-button-restored.png',
  );
});

test('a 503 stops the send button and keeps the typed feedback', async ({ page }) => {
  test.skip(process.env.FST_E2E_EMULATOR !== '1', 'FST_E2E_EMULATOR=1 のときだけ Auth エミュレーターへ切り替える');
  await seed('cap', 'e2e-503@example.test');
  await openFeedback(page, 'e2e-503@example.test');
  await page.route('**/api/fst-feedback', route => route.fulfill({
    status: 503,
    headers: { 'content-type': 'application/json', 'retry-after': '3' },
    body: JSON.stringify({ error: 'COST_GUARD_UNAVAILABLE' }),
  }));
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expectHold(
    page,
    '混み合っています。少し待ってもう一度送ってください',
    'e2e-503-button-paused.png',
    'e2e-503-button-restored.png',
  );
});

test('a 503 without Retry-After keeps the send button paused for sixty seconds', async ({ page }) => {
  test.skip(process.env.FST_E2E_EMULATOR !== '1', 'FST_E2E_EMULATOR=1 のときだけ Auth エミュレーターへ切り替える');
  await seed('cap', 'e2e-503-noretry@example.test');
  await openFeedback(page, 'e2e-503-noretry@example.test');
  await page.clock.install();
  await page.route('**/api/fst-feedback', route => route.fulfill({
    status: 503,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'COST_GUARD_UNAVAILABLE' }),
  }));
  await page.getByRole('button', { name: '送信', exact: true }).click();
  const subject = page.getByPlaceholder('例：タスク追加時の不具合について');
  const body = page.getByPlaceholder('ご意見・ご要望・不具合報告など');
  const waiting = page.getByRole('button', { name: 'あと60秒' });
  await expect(page.getByText('混み合っています。少し待ってもう一度送ってください')).toBeVisible();
  await expect(waiting).toBeDisabled();
  await expect(waiting).toHaveCSS('background-color', 'rgb(92, 99, 112)');
  await expect(subject).toHaveValue('E2Eの件名');
  await expect(body).toHaveValue('E2Eの本文は残る');
  await page.screenshot({ path: path.join(shotDir, 'e2e-503-no-retry-paused.png') });
  await page.clock.fastForward(60_000);
  const restored = page.getByRole('button', { name: '送信', exact: true });
  await expect(restored).toBeEnabled();
  await expect(subject).toHaveValue('E2Eの件名');
  await expect(body).toHaveValue('E2Eの本文は残る');
  await expect(page.getByText('混み合っています。少し待ってもう一度送ってください')).toBeVisible();
  await page.screenshot({ path: path.join(shotDir, 'e2e-503-no-retry-restored.png') });
});
