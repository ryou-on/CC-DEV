import {test,expect} from '@playwright/test';
test('intake names and legacy saved recordings share one participant',async({page})=>{
 const names=['A　山田太郎11239824529','A山田 太郎12239824529'];
 await page.route('**/api/speech/recordings',route=>route.fulfill({json:{recordings:names.map((speaker,i)=>({id:`name-${i}`,speaker,day:'Day 1',room:'gA',session:'ワーク1',kind:'Room',analysisMode:'volume',utterances:[{id:'u0',start:0,end:10,speechSeconds:10,text:'',analysis:null}]}))}}));
 await page.goto('./');await page.getByText('録音を取り込む',{exact:false}).first().click();
 await page.locator('input[type=file]').first().setInputFiles(names.map(name=>({name:`${name}.m4a`,mimeType:'audio/mp4',buffer:Buffer.from('fixture')})));
 await expect(page.getByLabel('参加者ID',{exact:true})).toHaveCount(2);
 for(const input of await page.getByLabel('参加者ID',{exact:true}).all()) await expect(input).toHaveValue('A山田太郎');
 await page.getByRole('button',{name:'実録音',exact:true}).click();
 await expect(page.getByLabel('参加者フィルタ').locator('option')).toHaveCount(2);
 const row=page.getByRole('table').first().locator('tbody tr');await expect(row).toHaveCount(1);await expect(row).toContainText('A山田太郎');await expect(row).toContainText('0:20');
});
