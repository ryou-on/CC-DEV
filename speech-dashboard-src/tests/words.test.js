import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, tokens } from '../src/words.js';
test('word counts normalize width/case and ignore particles, numbers and excluded words',()=>{
 const rows=countWords([{text:'顧客の課題。顧客に提案。ＡＩ ai 123。'},{text:null}], '提案');
 assert.equal(rows.find(r=>r.word==='顧客').count,2);
 assert.equal(rows.find(r=>r.word==='ai').count,2);
 for(const w of ['の','に','123','提案']) assert.ok(!rows.some(r=>r.word===w));
 assert.deepEqual(countWords([{text:''}]),[]);
 assert.ok(tokens('課題を確認').includes('課題'));
});
import { categoryFor } from '../src/wordCategories.js';
import { layoutWords } from '../src/cloudLayout.js';
test('compound dental, medical and training terms retain category and counts',()=>{
 const result=countWords([{text:'歯周病、感染対策、KJ法、5S、PDCAと歯周病。'}]);
 assert.equal(result.find(r=>r.word==='歯周病').count,2);
 for(const [word,category] of [['歯周病','dental'],['感染対策','medical'],['kj法','training'],['5s','training'],['pdca','training'],['来週','general']]) assert.equal(categoryFor(word),category);
});
test('cloud packing stays within bounds without overlaps at desktop and mobile widths',()=>{
 for(const width of [260,1200]) {
  const rows=layoutWords(Array.from({length:60},(_,i)=>({word:`用語${i}`,count:60-i})),width,460,(word,size)=>word.length*size);
  assert.ok(rows.length>10);
  for(const p of rows) assert.ok(p.x>=0 && p.y>=0 && p.x+p.width<=width && p.y+p.height<=460);
  rows.forEach((p,i)=>rows.slice(i+1).forEach(q=>assert.ok(p.x+p.width<=q.x || q.x+q.width<=p.x || p.y+p.height<=q.y || q.y+q.height<=p.y)));
 }
});
