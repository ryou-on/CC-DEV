import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => { await page.route('**/api/speech/demo-photos', route => route.fulfill({json:{photos:{}}})); });
async function loadGallery(page) {
 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,640,360);
  ['ALICE','BOB','CAROL','DAVID'].forEach((name,i)=>{const x=30+(i%2)*300,y=15+Math.floor(i/2)*170;ctx.fillStyle='#bbb';ctx.fillRect(x,y,240,135);ctx.fillStyle='#444';ctx.fillRect(x,y+105,240,30);ctx.fillStyle='#fff';ctx.font='20px sans-serif';ctx.fillText(name,x+30,y+127);});return c.toDataURL('image/png');
 });
 await page.getByLabel('スクリーンショット画像').setInputFiles({name:'gallery.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')});
}
test('bulk OCR requires review, supports edits/exclusions and blocks duplicate names',async({page})=>{
 await page.route('**/api/speech/photo-names',route=>route.fulfill({json:{labels:[{index:0,name:'Alice',confidence:91},{index:1,name:'B0b',confidence:40},{index:2,name:'',confidence:0},{index:3,name:'Camera off',confidence:90}]}}));
 await page.goto('./');await page.getByRole('button',{name:'顔写真',exact:true}).click();await loadGallery(page);
 await page.getByRole('button',{name:'参加者枠と名前を一括読み取り'}).click();
 await expect(page.getByLabel('候補 1 の名前',{exact:true})).toHaveValue('Alice');
 await page.getByLabel('候補 2 の名前',{exact:true}).fill('Alice');await page.getByLabel('候補 4 を登録',{exact:true}).uncheck();
 const button=page.getByRole('button',{name:'確認した2人を一括登録'});await expect(button).toBeDisabled();
 await page.getByLabel('候補 2 の名前',{exact:true}).fill('Bob');await page.getByRole('checkbox',{name:/選択した全員の名前と写真/}).check();await button.click();
 await expect(page.getByRole('status').filter({hasText:'2人の顔写真を保存しました'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('speech-dashboard.photos.v1.demo'))))).toEqual(['Alice','Bob']);
 await page.getByRole('button',{name:'閉じる',exact:true}).click();await page.reload();await page.getByRole('button',{name:'顔写真',exact:true}).click();
 await page.getByLabel('写真の参加者').selectOption('Bob');await expect(page.getByRole('dialog').getByAltText('Bobの顔写真')).toBeVisible();
});
test('real OCR service reads synthetic gallery labels',async({page})=>{
 test.setTimeout(90000);
 if(process.env.OCR_TEST_BASE) await page.route('**/api/speech/photo-names', async route => { const response=await route.fetch({url:process.env.OCR_TEST_BASE+'/api/speech/photo-names'}); await route.fulfill({response}); });
 await page.goto('./');await page.getByRole('button',{name:'顔写真',exact:true}).click();await loadGallery(page);
 await page.getByRole('button',{name:'参加者枠と名前を一括読み取り'}).click();
 await expect(page.getByLabel('候補 1 の名前',{exact:true})).toHaveValue(/ALICE/i,{timeout:65000});
 await expect(page.getByLabel('候補 2 の名前',{exact:true})).toHaveValue(/BOB/i);
 await expect(page.getByLabel('候補 3 の名前',{exact:true})).toHaveValue(/CAROL/i);
});
test('OCR unavailable retains candidates for manual entry',async({page})=>{
 await page.route('**/api/speech/photo-names',route=>route.fulfill({status:503,json:{code:'OCR_UNAVAILABLE'}}));
 await page.goto('./');await page.getByRole('button',{name:'顔写真',exact:true}).click();await loadGallery(page);
 await page.getByRole('button',{name:'参加者枠と名前を一括読み取り'}).click();
 await expect(page.getByRole('status').filter({hasText:'名前を読み取れませんでした'})).toBeVisible();
 await expect(page.getByAltText('候補 1 の切り抜き',{exact:true})).toBeVisible();
 await page.getByLabel('候補 1 の名前',{exact:true}).fill('手動確認');await page.getByLabel('候補 1 を登録',{exact:true}).check();
 await page.getByRole('checkbox',{name:/選択した全員の名前と写真/}).check();await page.getByRole('button',{name:'確認した1人を一括登録'}).click();
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('speech-dashboard.photos.v1.demo'))))).toEqual(['手動確認']);
});
