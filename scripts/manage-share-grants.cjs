#!/usr/bin/env node
'use strict';
// Uses Application Default Credentials; never put service-account keys in the repository.
// Dry-run by default. Identity must be a verified, existing Google-linked Firebase user.
const { initializeApp, applicationDefault } = require('../functions/node_modules/firebase-admin/app');
const { getAuth } = require('../functions/node_modules/firebase-admin/auth');
const { getFirestore, Timestamp } = require('../functions/node_modules/firebase-admin/firestore');
const scopes=new Set(['apps','tomoe-home','tomoe-player','ouchi-hamasushi','note-analytics','meet-knowledge','outreach-crm','bombing-bay','hihaho-analytics']);
async function main(){
 const args=process.argv.slice(2),apply=args.includes('--apply');const values=args.filter(x=>x!=='--apply');
 const [collection,tenant,email,role,days='14']=values;
 if(values.length<4||values.length>5||!scopes.has(collection)||!tenant||tenant.includes('/')||tenant.includes('__')||tenant.length>100||!['reader','writer','revoke'].includes(role)||!Number.isInteger(Number(days))||Number(days)<1||Number(days)>30){throw Error('Usage: node scripts/manage-share-grants.cjs <collection> <tenant> <Google email> <reader|writer|revoke> [days 1..30] [--apply]');}
 const app=initializeApp({credential:applicationDefault(),projectId:'cc-dev-ps7'}),db=getFirestore(app);
 const user=await getAuth(app).getUserByEmail(email);
 if(role!=='revoke' && (user.disabled||!user.emailVerified||!user.providerData.some(p=>p.providerId==='google.com')))throw Error('Verified, enabled Google account required');
 const scope=collection+'__'+tenant,ref=db.doc('accessGrants/'+scope);
 if(!apply){console.log(JSON.stringify({dryRun:true,project:'cc-dev-ps7',scope,uid:user.uid,role,validDays:Number(days)}));return;}
 await db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref),old=snapshot.data()||{};
  const active=old.enabled===true && old.expiresAt?.toMillis()>Date.now();
  const readers=(active?old.readers||[]:[]).filter(u=>u!==user.uid),writers=(active?old.writers||[]:[]).filter(u=>u!==user.uid);
  if(role==='reader')readers.push(user.uid);if(role==='writer')writers.push(user.uid);
  if(readers.length+writers.length>50)throw Error('Maximum 50 members per scope');
  // A revoked user is removed without extending other members' grant expiry.
  const expiresAt=role==='revoke'?(old.expiresAt||Timestamp.fromMillis(0)):Timestamp.fromMillis(Math.min(active?old.expiresAt.toMillis():Infinity,Date.now()+Number(days)*86400000));
  tx.set(ref,{enabled:true,readers,writers,expiresAt,updatedAt:Timestamp.now()});
 });
 console.log(JSON.stringify({applied:true,scope,uid:user.uid,role}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
