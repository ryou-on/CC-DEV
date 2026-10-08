import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
let env;
const token={email:'member@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}};
const owner='uyCVvTEqAUXjK01lfcD4QfR7JiE3';
const samples=[
 ['apps/example','apps__registry',{name:'app'}],
 ['tomoe-home/config','tomoe-home__config',{apps:[]}],
 ['ouchi-hamasushi/family/assets/image_x','ouchi-hamasushi__family',{data:'data:image/png;base64,AA',mimeType:'image/png',size:24,updatedAt:Timestamp.now()}],
 ['note-analytics/default/snapshots/week','note-analytics__default',{views:1}],
 ['tomoe-player/list','tomoe-player__list',{videos:[]}],
 ['playlist_analytics/example','hihaho-analytics__global',{views:1}],
 ['video_analytics/example','hihaho-analytics__global',{plays:1}],
 ['meet-knowledge/team/entries/q','meet-knowledge__team',{question:'q',answer:'a',keywords:[]}],
 ['outreach-crm/workspace','outreach-crm__workspace',{leads:[],updatedAt:1}],
 ['bombing-bay/global/players/player','bombing-bay__global',{createdAt:1,ua:'test'}],
 ['bombing-bay/global/plays/play','bombing-bay__global',{pid:'player',name:'p',map:'m',score:0,timeSec:1,result:'over'}],
 ['tomoe-player/list/sessions/session','tomoe-player__list',{videoId:'v',title:'t',startedAt:'2026-10-05T00:00:00Z',day:'2026-10-05',dow:1,hour:0,watchSec:1,completed:false}]
];
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-cc-dev-cost',firestore:{host:'127.0.0.1',port:8087,rules:await readFile('../../firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{for(const [path,scope,data]of samples){await setDoc(doc(c.firestore(),path),data);await setDoc(doc(c.firestore(),'accessGrants',scope),{enabled:true,readers:['reader'],writers:['writer'],expiresAt:Timestamp.fromMillis(Date.now()+3600000)});}});});
for(const [path,scope,data]of samples){
 test(path+': anonymous / other user rejected; owner / member read',async()=>{
  for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext('stranger',token).firestore(),env.authenticatedContext('writer',{...token,email_verified:false}).firestore(),env.authenticatedContext('writer',{...token,firebase:{sign_in_provider:'anonymous'}}).firestore()]){
   await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),data));
  }
  for(const uid of [owner,'reader','writer'])await assertSucceeds(getDoc(doc(env.authenticatedContext(uid,token).firestore(),path)));
  await assertFails(setDoc(doc(env.authenticatedContext('reader',token).firestore(),path),data));
  // Create separately for append-only ranking collections.
  const target=path.includes('bombing-bay')?path+'-new':path;
  await assertSucceeds(setDoc(doc(env.authenticatedContext('writer',token).firestore(),target),data));
 });
}
test('expired / disabled grants and code guessing cannot confer membership',async()=>{
 const db=env.authenticatedContext('writer',token).firestore();
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'accessGrants/meet-knowledge__team'),{enabled:true,readers:[],writers:['writer'],expiresAt:Timestamp.fromMillis(1)});});
 await assertFails(getDoc(doc(db,'meet-knowledge/team/entries/q')));
 await assertFails(setDoc(doc(db,'accessGrants/meet-knowledge__team'),{enabled:true,writers:['writer']}));
 await assertFails(setDoc(doc(env.authenticatedContext(owner,token).firestore(),'accessGrants/meet-knowledge__team'),{enabled:true,writers:['writer']}));
 await assertFails(getDoc(doc(db,'meet-knowledge/other/entries/q')));
});
test('private financial controls cannot be read or overwritten by clients',async()=>{for(const uid of [owner,'writer']){const db=env.authenticatedContext(uid,token).firestore();for(const path of ['costControls/global','costCounters/test','costStopBackups/test']){await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{enabled:true}));}}});
