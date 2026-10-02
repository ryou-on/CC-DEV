import {test,expect} from '@playwright/test';
test('subtitle identity candidate requires review, saves and offers undo',async({page})=>{
 const record={id:'r-sync',speaker:'山田',day:'Day 1',room:'Main',session:'全体会',start:0,end:10,analysisMode:'volume',utterances:[{id:'u0',start:0,end:4,speechSeconds:4,text:'',analysis:null}]};let posts=0;
 await page.route('**/api/speech/recordings',r=>r.fulfill({json:{recordings:[record]}}));
 await page.route('**/api/speech/recordings/r-sync/sync',r=>{posts++;const data=JSON.parse(r.request().postData());if(data.clear){delete record.syncedSource;delete record.utterances[0].syncedText;}else{record.syncedSource={name:'meeting.vtt'};record.utterances[0].syncedText='歯周病の確認';}return r.fulfill({json:{recording:record}});});
 await page.goto('./');await page.getByRole('button',{name:'実録音',exact:true}).click();
 await page.locator('input[type=file]').first().setInputFiles({name:'meeting.vtt',mimeType:'text/vtt',buffer:Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v 山田>歯周病の確認</v>')});
 await page.getByLabel('同期する字幕').selectOption({label:'meeting.vtt'});await expect(page.getByLabel('同期先の音声')).toHaveValue('r-sync');
 await expect(page.getByRole('button',{name:'確認した字幕を同期'})).toBeDisabled();expect(posts).toBe(0);
 await page.getByRole('checkbox',{name:'同じセッション・参加者・時間基準であることを確認しました'}).check();await page.getByRole('button',{name:'確認した字幕を同期'}).click();
 await expect(page.getByRole('table').last()).toContainText('歯周病の確認');await expect(page.getByRole('button',{name:'字幕同期を解除'})).toBeVisible();await page.getByRole('button',{name:'字幕同期を解除'}).click();await expect(page.getByRole('table').last()).toContainText('発話量のみ（文字起こし対象外）');
});
