const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const api=require('../public/hazard-dashboard/municipal.js');
const dir=path.join(__dirname,'../public/hazard-dashboard/data');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
let total=0;
for(const source of manifest.sources){
 const data=fs.readFileSync(path.join(dir,source.file));
 assert.equal(data.length,source.count*12);
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),source.sha256);
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 for(const offset of [0,Math.floor(source.count/2)*12,(source.count-1)*12]){
  const point={lat:view.getUint32(offset,true)/1e7,lng:view.getUint32(offset+4,true)/1e7};
  const result=api.nearest(view,point,.001);
  assert(result);assert.equal(result.depth,view.getFloat32(offset+8,true));assert(result.distance<.001);
 }
 assert.equal(api.nearest(view,{lat:35.68124,lng:139.76713}),null);
 total+=source.count;
}
const buffer=new ArrayBuffer(24), view=new DataView(buffer);
for(let i=0;i<2;i++){view.setUint32(i*12,357000000,true);view.setUint32(i*12+4,1397000000+i*1000,true);view.setFloat32(i*12+8,i*2,true)}
assert.equal(api.nearest(view,{lat:35.7,lng:139.7}).depth,0);
assert.equal(api.nearest(view,{lat:35.7,lng:139.7001}).depth,2);
assert.equal(api.nearest(view,{lat:35.7,lng:139.7003}),null);
assert.equal(api.color(0),null);assert.equal(api.color(.099),null);
assert.equal(api.color(.1),'#fff6ae');assert.equal(api.color(.5),'#ffe080');
assert.equal(api.color(1),'#ffc394');assert.equal(api.color(10),'#873a99');
console.log(`PASS: ${total} records, SHA-256, nearest source coordinates, zero vs missing, legend boundaries`);
