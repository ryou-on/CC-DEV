import {test,expect} from '@playwright/test';
test('volume completes without transcript and upgrading requires explicit submission',async({page})=>{
 let saved=[],modes=[];
 await page.route('**/api/speech/recordings',route=>{
  if(route.request().method()==='POST') { const raw=route.request().postData();const mode=raw.includes('"analysisMode":"full"')?'full':'volume';modes.push(mode);saved=[{id:'mode-test',speaker:'test',day:'Day 1',room:'Main',session:'全体会',analysisMode:mode,status:'complete',utterances:[{id:'u0',start:0,end:2,speechSeconds:2,text:mode==='full'?'歯周病の予防':'',analysis:null}]}];return route.fulfill({json:{recording:saved[0]}}); }
  return route.fulfill({json:{recordings:saved}});
 });
 await page.goto('./');await expect(page.getByRole('radio',{name:'発話量のみ',exact:true})).toBeChecked();
 await page.getByText('録音を取り込む',{exact:false}).first().click();await page.locator('input[type=file]').setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture')});await page.getByRole('button',{name:'分析して保存',exact:true}).click();
 await expect(page.getByText('発話量のみ（文字起こし対象外）',{exact:true})).toBeVisible();await expect(page.getByText('発言内容まで振り返りたい方へ')).toBeVisible();
 await page.getByRole('button',{name:'文字起こし＋内容分析を選ぶ'}).click();expect(modes).toEqual(['volume']);await expect(page.getByRole('radio',{name:'文字起こし＋内容分析',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'分析して保存',exact:true}).click();await expect(page.getByRole('region',{name:'ワードクラウド',exact:true})).toBeVisible();expect(modes).toEqual(['volume','full']);
});
