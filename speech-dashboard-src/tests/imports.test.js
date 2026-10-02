import {test} from 'node:test';import assert from 'node:assert/strict';
import {fileKind,droppedFiles,textLines} from '../src/imports.js';
test('directory traversal exhausts batches and includes nested mixed files',async()=>{
 const file=name=>({isFile:true,file:yes=>yes({name})});let batch=0;
 const root={isDirectory:true,createReader:()=>({readEntries:yes=>yes(batch++===0?Array.from({length:25},(_,i)=>file(`${i}.M4A`)):batch===2?[{isDirectory:true,createReader:()=>{let done=false;return {readEntries:yes=>{yes(done?[]:[file('names.txt'),file('zoom.jpg')]);done=true;}};}}]:[])})};
 const rows=await droppedFiles({items:[{webkitGetAsEntry:()=>root}]});assert.equal(rows.length,27);assert.equal(fileKind(rows[0]),'audio');assert.equal(fileKind(rows[25]),'text');assert.equal(fileKind(rows[26]),'image');assert.equal(fileKind({name:'unknown.pdf'}),'unsupported');
 assert.deepEqual(textLines('WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n会話の確認','test.vtt'),['会話の確認']);
});
