import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => { await page.route('**/api/speech/demo-photos', route => route.fulfill({json:{photos:{}}})); });
async function screenshotFixture(page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ee3322'; ctx.fillRect(0, 0, 200, 200); ctx.fillStyle = '#2244ee'; ctx.fillRect(200, 0, 200, 200);
    return canvas.toDataURL('image/png');
  });
  return { name: 'zoom-test.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') };
}
test('crop screenshot, persist portraits, isolate sample photos and delete', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const posted = []; page.on('request', request => { if (request.method() === 'POST') posted.push(request.postData() || ''); });
  await page.route('**/api/speech/recordings*', route => route.fulfill({ json: { recordings: [{ id: 'r1', day: 'Day 1', room: 'Main', speaker: 'A-01', session: '全体会', utterances: [] }] } }));
  await page.goto('./');
  await page.getByRole('button', { name: 'A-01の写真を設定' }).click();
  await expect(page.getByLabel('写真の参加者')).toHaveValue('A-01');
  await page.getByLabel('スクリーンショット画像').setInputFiles(await screenshotFixture(page));
  await page.getByLabel('横位置', { exact: true }).fill('25');
  await page.getByLabel('枠の大きさ', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'この写真を保存', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('このブラウザに保存しました');
  const red = await page.evaluate(() => JSON.parse(localStorage.getItem('speech-dashboard.photos.v1.demo'))['A-01']);
  expect(red).toMatch(/^data:image\/jpeg;base64,/);
  const pixel = await page.evaluate(async src => { const img = new Image(); img.src = src; await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 160; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(80, 80, 1, 1).data]; }, red);
  expect(pixel[0]).toBeGreaterThan(200); expect(pixel[2]).toBeLessThan(70);
  await page.getByLabel('写真の参加者').selectOption('B-01');
  await page.getByLabel('横位置', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'この写真を保存', exact: true }).click();
  await page.screenshot({ path: 'test-results/photos-editor.png', fullPage: true });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByAltText('A-01の顔写真').first()).toBeVisible();
  await page.reload();
  await expect(page.getByAltText('A-01の顔写真').first()).toHaveAttribute('src', red);
  await page.getByRole('button', { name: 'コンソールをコピー' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain('data:image');
  await page.getByRole('button', { name: '実録音', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A-01の写真を設定' })).toBeVisible();
  await expect(page.getByAltText('A-01の顔写真')).toHaveCount(0);
  await page.getByRole('button', { name: 'サンプル', exact: true }).click();
  await page.getByRole('button', { name: 'A-01の写真を設定' }).click();
  await page.getByRole('button', { name: 'この参加者の写真を削除' }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.reload(); await expect(page.getByAltText('A-01の顔写真')).toHaveCount(0);
  expect(posted.join('')).not.toContain('data:image');
});
test('screen capture stops video tracks after snapshot; cancellation offers file fallback', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async options => {
      if (++calls > 1) throw new DOMException('cancelled', 'NotAllowedError');
      window.captureOptions = options;
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#37aa88'; ctx.fillRect(0, 0, 320, 180);
      const stream = canvas.captureStream(10); window.testTracks = stream.getTracks();
      return stream;
    } });
  });
  await page.goto('./'); await page.getByRole('button', { name: '顔写真', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom画面を選んで取得' }).click();
  await expect(page.getByAltText('切り抜きプレビュー')).toBeVisible();
  expect(await page.evaluate(() => window.captureOptions.audio)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.testTracks.every(t => t.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'Zoom画面を選んで取得' }).click();
  await expect(page.getByRole('status').last()).toContainText('キャンセル');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('photo editor supports mobile and reports quota failure without a false save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('./');
  await page.getByRole('button', { name: '顔写真', exact: true }).click();
  await page.getByLabel('スクリーンショット画像').setInputFiles(await screenshotFixture(page));
  await expect(page.getByAltText('切り抜きプレビュー')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'この写真を保存' }).click();
  await expect(page.getByRole('status').last()).toContainText('保存できませんでした');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
