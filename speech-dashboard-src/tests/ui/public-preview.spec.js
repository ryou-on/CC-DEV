import {test,expect} from '@playwright/test';
test('public preview identifies unavailable services and prevents audio submission',async({page})=>{
 const calls=[];
 await page.route('https://preview.invalid/**', async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){calls.push(url.pathname);return route.fulfill({status:404,body:''});}
  const response=await page.request.get(`http://127.0.0.1:4173${url.pathname}`);await route.fulfill({response});
 });
 await page.goto('https://preview.invalid/speech-dashboard/');
 await expect(page.getByText('公開プレビュー：',{exact:false})).toBeVisible();
 await page.getByText('録音を取り込む',{exact:false}).first().click();
 await page.locator('input[type=file]').first().setInputFiles({name:'A山田太郎123.m4a',mimeType:'audio/mp4',buffer:Buffer.from('fixture')});
 await expect(page.getByRole('button',{name:'分析して保存',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'実録音',exact:true}).click();
 expect(calls).toEqual([]);
});
