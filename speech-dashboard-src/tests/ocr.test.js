import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTiles, manualTiles } from '../src/gallery.js';
import { parseLabels, validateSheet } from '../server/ocr.js';
import { writePhotos } from '../src/photos.js';
test('gallery detector finds separate rows and centers a partial last row', () => {
  const width=800, height=500, data=new Uint8ClampedArray(width*height*4);
  const rectangles=[[20,40,230,130],[280,40,230,130],[540,40,230,130],[280,200,230,130]];
  for(const [x,y,w,h] of rectangles) for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) { const p=(j*width+i)*4; data[p]=data[p+1]=data[p+2]=180; data[p+3]=255; }
  const tiles=detectTiles({data,width,height}); assert.equal(tiles.length,4); assert.equal(tiles[3].x,280);
  assert.equal(detectTiles({data:new Uint8ClampedArray(width*height*4),width,height}).length,0);
  assert.throws(()=>manualTiles(800,500,{left:40,right:20,top:0,bottom:100,columns:3,rows:2}));
});
test('OCR TSV maps labels by source row and leaves unreadable rows blank', () => {
 const tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t20\t30\t20\t90\t山田\n5\t1\t1\t1\t1\t2\t50\t20\t30\t20\t70\t太郎\n5\t1\t1\t1\t2\t1\t10\t280\t30\t20\t80\t佐藤';
 const labels=parseLabels(tsv,3); assert.equal(labels[0].name,'山田 太郎'); assert.equal(labels[0].confidence,80); assert.equal(labels[1].name,''); assert.equal(labels[2].name,'佐藤');
 const b=Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.writeUInt32BE(1024,16); b.writeUInt32BE(384,20);
 assert.equal(validateSheet(b,3),true); assert.equal(validateSheet(b,4),false); assert.equal(validateSheet(b,101),false);
});
test('batch photo writes validate all candidates before atomic persistence', () => {
 let writes=0; globalThis.localStorage={setItem:()=>writes++}; const photo='data:image/jpeg;base64,AAAA';
 assert.throws(()=>writePhotos('demo',{},[{name:'A',photo},{name:'A',photo}])); assert.equal(writes,0);
 assert.throws(()=>writePhotos('demo',{},[{name:'A',photo},{name:'',photo}])); assert.equal(writes,0);
 const saved=writePhotos('demo',{},[{name:'A',photo},{name:'B',photo}]); assert.equal(writes,1); assert.deepEqual(Object.keys(saved),['A','B']);
 delete globalThis.localStorage;
});
