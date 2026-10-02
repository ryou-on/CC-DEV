import {test} from 'node:test';import assert from 'node:assert/strict';
import {fileKind,droppedFiles,textLines} from '../src/imports.js';
test('directory traversal exhausts batches and includes nested mixed files',async()=>{
 const file=name=>({isFile:true,file:yes=>yes({name})});let batch=0;
 const root={isDirectory:true,createReader:()=>({readEntries:yes=>yes(batch++===0?Array.from({length:25},(_,i)=>file(`${i}.M4A`)):batch===2?[{isDirectory:true,createReader:()=>{let done=false;return {readEntries:yes=>{yes(done?[]:[file('names.txt'),file('zoom.jpg')]);done=true;}};}}]:[])})};
 const rows=await droppedFiles({items:[{webkitGetAsEntry:()=>root}]});assert.equal(rows.length,27);assert.equal(fileKind(rows[0]),'audio');assert.equal(fileKind(rows[25]),'text');assert.equal(fileKind(rows[26]),'image');assert.equal(fileKind({name:'unknown.pdf'}),'unsupported');
 assert.deepEqual(textLines('WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n会話の確認','test.vtt'),['会話の確認']);
});
import {folderRoom,importPath} from '../src/imports.js';
test('room inference respects named ancestors, main, custom rooms and loose files',()=>{
 for(const folder of ['Room A','ルームＡ','A','Breakout Room A'])assert.equal(folderRoom(`研修/${folder}/音声/test.m4a`).room,'Room A');
 assert.equal(folderRoom('Day 1/Main/audio/test.m4a').kind,'Main');
 assert.equal(folderRoom('研修/営業チーム/test.m4a').room,'営業チーム');
 assert.equal(folderRoom('test.m4a').kind,'Main');
 assert.equal(folderRoom('Main/Room B/test.m4a').room,'Room B');
});
test('drop paths preserve nested room names',async()=>{
 const file={name:'person.wav'},leaf={name:'person.wav',isFile:true,file:yes=>yes(file)};
 const dir=(name,children)=>({name,isDirectory:true,createReader:()=>{let done=false;return {readEntries:yes=>{yes(done?[]:children);done=true;}};}});
 const rows=await droppedFiles({items:[{webkitGetAsEntry:()=>dir('Day 1',[dir('Room C',[leaf])])}]});
 assert.equal(importPath(rows[0]),'Day 1/Room C/person.wav');assert.equal(folderRoom(importPath(rows[0])).room,'Room C');
});
