import {test,expect} from '@playwright/test';
test('folder-relative path sets editable room on intake',async({page})=>{
 await page.goto('./');await page.getByText('録音を取り込む',{exact:false}).first().click();
 await page.evaluate(()=>{
  const f=new File(['fixture'],'person.wav',{type:'audio/wav'});Object.defineProperty(f,'webkitRelativePath',{value:'研修/ルームＢ/person.wav'});
  const dt=new DataTransfer();dt.items.add(f);document.querySelector('input[type=file]').files=dt.files;document.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}));
 });
 await expect(page.getByLabel('Room名',{exact:true})).toHaveValue('Room B');await expect(page.getByLabel('Main / Room',{exact:true})).toHaveValue('Room');
 await page.getByLabel('Room名',{exact:true}).fill('グループB');await expect(page.getByLabel('Room名',{exact:true})).toHaveValue('グループB');
});
