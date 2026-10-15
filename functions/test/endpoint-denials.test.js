'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createGuard, CostError, sendCostError } = require('../cost-guard');

function harness(file) {
  let paid = 0, storage = 0;
  const db = { doc: x => x, runTransaction: async () => { storage++; throw Error('offline'); } };
  const guard = createGuard({ db, verifyIdToken: async token => {
    if (token !== 'valid') throw Error('invalid');
    return { uid: 'owner', email: 'junpei.omote@gmail.com', email_verified: true };
  }, verifyAppCheck: async token => { if (token !== 'valid') throw Error('invalid'); } });
  const admin = { apps:[{}], firestore:()=>db, auth:()=>({verifyIdToken:async token => {
    if (token !== 'valid') throw Error('invalid');
    return {uid:'owner',email:'junpei.omote@gmail.com'};
  }}) };
  const context = { exports:{}, require: name => {
    if(name==='firebase-functions/v2/https') return {onRequest:(_opts,fn)=>fn};
    if(name==='firebase-functions/v2') return {setGlobalOptions:()=>{}};
    if(name==='firebase-functions/params') return {defineSecret:()=>({value:()=> 'test-only'})};
    if(name==='@anthropic-ai/sdk') return class { constructor(){ this.messages={create:async()=>{paid++;throw Error('unexpected paid call')},stream:()=>{paid++;throw Error('unexpected paid call')}}; } };
    if(name==='firebase-admin') return admin;
    if(name==='firebase-admin/functions') return {getFunctions:()=>{throw Error('unexpected queue')}};
    if(name==='firebase-functions/v2/tasks') return {onTaskDispatched:(_opts,fn)=>fn};
    if(name==='./cost-guard') return {getGuard:()=>guard, CostError, sendCostError};
    if(name==='./mini-me'||name==='./hondoko') return {};
    if(name==='./realtime-cost') return require('../realtime-cost');
    return require(name);
  }, console, Buffer, process, URL, URLSearchParams, AbortSignal, FormData,
  fetch:async()=>{paid++; throw Error('paid upstream must not run');}, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  return { functions:context.exports, counts:()=>({paid,storage}) };
}
function response() {
  return { statusCode:200, set(){return this;}, status(n){this.statusCode=n;return this;}, json(data){this.body=data;return this;}, send(data){this.body=data;return this;}, end(){return this;} };
}
const cases=[['index.js','realtimeToken','v=0\r\n'],['index.js','interpreterCall',{sdp:'v=0\r\n',direction:'en2ja'}],['index.js','anthropicProxy',{model:'claude-sonnet-4-6',max_tokens:256,messages:[{role:'user',content:'test'}]}],['mini-me.js','miniMeGenerate',{imageBase64:'aGVsbG8=',mimeType:'image/jpeg'}],['hondoko.js','hondokoAnalyze',{image:'aGVsbG8=',mediaType:'image/jpeg'}]];
for(const [file,name,body] of cases) {
  for(const token of ['', 'invalid', 'valid']) {
    test(`${name}: ${token||'missing'} credentials / unavailable quota cannot call provider`,async()=>{
      const h=harness(file), res=response();
      const headers={'origin':'https://cc-dev-ps7.web.app','content-type':typeof body==='string'?'application/sdp':'application/json','x-api-key':'test-only','authorization':token?'Bearer '+token:'','x-firebase-appcheck':'valid'};
      const req={method:'POST',body,rawBody:Buffer.from(typeof body==='string'?body:JSON.stringify(body)),headers,query:{},get:key=>headers[key.toLowerCase()]};
      await h.functions[name](req,res);
      assert.ok([401,403,503].includes(res.statusCode),`${name} returned ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(h.counts().paid,0);
      if(token!=='valid') assert.equal(h.counts().storage,0);
    });
  }
}
