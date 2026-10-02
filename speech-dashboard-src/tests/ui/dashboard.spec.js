import { test, expect } from '@playwright/test';
test('demo filters, chart axes, timeline and accessible modals', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '対話のかたちを、見える化。' })).toBeVisible();
  for (const [button, title] of [['発話分析', '発話分析の使い方'], ['v0.11.1', 'リリースノート']]) {
    const trigger = page.getByRole('button', { name: button, exact: true });
    await trigger.click(); await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    if (button === '発話分析') await expect(page.getByRole('link', { name: 'ホームへ戻る' })).toHaveAttribute('href', 'https://cc-dev-ps7.web.app/');
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click(); await page.getByRole('button', { name: '閉じる', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await trigger.click(); await page.mouse.click(5, 5); await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByLabel('対象日', { exact: true }).selectOption('Day 2');
  await page.getByLabel('対象ルーム', { exact: true }).selectOption('Room A');
  await page.getByRole('button', { name: '日別', exact: true }).click();
  await page.getByRole('button', { name: 'ルーム別', exact: true }).click();
  await page.getByRole('button', { name: '個人別', exact: true }).click();
  await page.getByRole('button', { name: /A-01 .*の発言/ }).first().click();
  await expect(page.getByText('主体性', { exact: false }).first()).toBeVisible();
  await page.getByLabel('発言タイプ').selectOption('提案');
  await page.getByRole('checkbox', { name: '要確認のみ' }).check();
  expect(await page.getByRole('table').last().getByText('提案', { exact: true }).count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
});
test('mobile layout, file selection, metadata editing and private debug copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('./');
  await page.getByText('録音を取り込む', { exact: false }).first().click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'private-person.m4a', mimeType: 'audio/mp4', buffer: Buffer.from('fixture') });
  await expect(page.getByLabel('参加者ID', { exact: true })).toHaveValue('private-person');
  await page.getByLabel('参加者ID', { exact: true }).fill('参加者X');
  await page.getByRole('button', { name: '区間を追加', exact: true }).click();
  await expect(page.getByLabel('参加者ID', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'コンソールをコピー' }).click();
  const debug = await page.evaluate(() => navigator.clipboard.readText());
  expect(debug).not.toContain('private-person'); expect(debug).not.toContain('参加者X'); expect(debug).toContain('speech-dashboard');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
});
test('drag-drop through upload, partial result, reload and empty filter', async ({ page }) => {
  let saved = [];
  await page.route('**/api/speech/recordings*', async route => {
    if (route.request().method() === 'POST') {
      saved = [{ id: 'ui-test', speaker: 'participant.wav', day: 'Day 1', session: '全体会', kind: 'Main', room: 'Main', status: 'partial', utterances: [{ id: 'u0', start: 2, end: 7, speechSeconds: 5, text: '', analysis: null }] }];
      await route.fulfill({ status: 201, json: { recording: saved[0] } });
    } else await route.fulfill({ json: { recordings: saved } });
  });
  await page.goto('./');
  await page.getByText('録音を取り込む', { exact: false }).first().click();
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['test'], 'participant.wav', { type: 'audio/wav' })); return data; });
  await page.getByText('音声・テキスト・スクショ・フォルダをドラッグ＆ドロップ', { exact: true }).dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByLabel('参加者ID', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '分析して保存', exact: true }).click();
  await expect(page.getByText('部分完了', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').last().getByText('未分析', { exact: true })).toHaveCount(1);
  await page.reload(); await page.getByRole('button', { name: '実録音', exact: true }).click();
  await expect(page.getByRole('table').last().getByText('文字起こし未取得', { exact: true })).toHaveCount(1);
  await page.getByLabel('発言タイプ').selectOption('質問');
  await expect(page.getByText('該当する発言はありません。')).toBeVisible();
});
