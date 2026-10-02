import { test, expect } from '@playwright/test';
test('failed uploads retain reasons and rate limits stop later uploads',async({page})=>{
 let calls=0;
 await page.route('**/api/speech/recordings*',route=>{
  if(route.request().method()!=='POST') return route.fulfill({json:{recordings:[]}});
  calls++;return route.fulfill({status:calls===1?400:429,json:{code:calls===1?'INVALID_DURATION':'RATE_LIMIT'}});
 });
 await page.goto('./');await page.getByText('録音を取り込む',{exact:false}).first().click();
 await page.locator('input[type=file]').first().setInputFiles(['one','two','three'].map(n=>({name:n+'.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture')})));
 await page.getByRole('button',{name:'分析して保存',exact:true}).click();
 await expect(page.getByText(/今回の結果：完了 0件・部分完了 0件・失敗 2件/)).toBeVisible();
 await expect(page.getByText(/分析区間が録音の範囲外/)).toBeVisible();
 await expect(page.getByText(/処理回数の上限です/)).toBeVisible();
 expect(calls).toBe(2);await expect(page.getByText('待機',{exact:true})).toHaveCount(1);
});
