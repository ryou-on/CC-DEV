import {test,expect} from '@playwright/test';
test('more than twenty mixed files remain visible and text is separate from audio',async({page})=>{
 await page.goto('./');await page.getByText('録音を取り込む',{exact:false}).first().click();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=50;return c.toDataURL('image/png').split(',')[1];});
 await page.locator('input[type=file]').first().setInputFiles([...Array.from({length:25},(_,i)=>({name:`person-${i}.m4a`,mimeType:'audio/mp4',buffer:Buffer.from('fixture')})),{name:'reference.txt',mimeType:'text/plain',buffer:Buffer.from('歯周病の確認\n感染対策の整理')},{name:'zoom.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')},{name:'unknown.pdf',mimeType:'application/pdf',buffer:Buffer.from('fixture')}]);
 await expect(page.getByLabel('参加者ID',{exact:true})).toHaveCount(25);await expect(page.getByText('未対応形式',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'テキストを確認'}).click();await expect(page.getByRole('dialog')).toContainText('歯周病の確認');await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('button',{name:'顔写真を読み取る'}).click();await expect(page.getByAltText('切り抜きプレビュー')).toBeVisible();await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await expect(page.getByText('参考テキストのワードクラウド（音声とは別集計）',{exact:true})).toBeVisible();
});
