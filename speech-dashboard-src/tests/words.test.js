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
