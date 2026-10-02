import { test, expect } from '@playwright/test';
test('word cloud scopes counts, opens source utterances and excludes words',async({page})=>{
 await page.goto('./');
 const cloud=page.getByRole('region',{name:'ワードクラウド',exact:true});
 const word=cloud.getByRole('button',{name:/^課題：/});
 const before=Number((await word.getAttribute('aria-label')).match(/：(\d+)/)[1]);
 await page.getByLabel('対象日',{exact:true}).selectOption('Day 1');
 await page.getByLabel('対象ルーム',{exact:true}).selectOption('Room A');
 const after=Number((await word.getAttribute('aria-label')).match(/：(\d+)/)[1]);expect(after).toBeLessThan(before);
 await word.click();await expect(cloud.getByText(/「課題」を含む発言/)).toBeVisible();
 await expect(cloud.getByRole('list').getByRole('listitem').first()).toContainText('課題');
 await cloud.getByLabel('除外する語').fill('課題');await expect(word).toHaveCount(0);
 await expect(cloud.getByRole('list')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'実録音',exact:true}).click();await expect(cloud.getByText(/文字起こしのある発言がありません/)).toBeVisible();
});
test('cloud themes persist and dictionary categories can be corrected',async({page})=>{
 await page.goto('./');const region=page.getByRole('region',{name:'ワードクラウド',exact:true});const cloud=region.getByRole('group',{name:'頻出語'});
 await expect(cloud).toHaveAttribute('data-theme','dark');
 const word=cloud.getByRole('button',{name:/^歯周病：/});await expect(word).toHaveAttribute('data-category','dental');await word.click();
 await region.getByLabel('選択した単語の分類').selectOption('medical');await expect(word).toHaveAttribute('data-category','medical');
 await region.getByRole('button',{name:'ワードクラウドのダークモード'}).click();await expect(cloud).toHaveAttribute('data-theme','light');
 await page.reload();await expect(cloud).toHaveAttribute('data-theme','light');
 await page.setViewportSize({width:390,height:844});await expect(word).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
