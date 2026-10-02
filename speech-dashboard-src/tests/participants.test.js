import {test} from 'node:test';
import assert from 'node:assert/strict';
import {participantName, normalizeParticipants} from '../src/participants.js';
import {summarize, totals} from '../src/metrics.js';
import {personKey} from '../src/sync.js';
test('Zoom names retain group prefixes but lose suffix numbers and spaces',()=>{
 assert.equal(participantName('audioA　山田 太郎11239824529.m4a'),'A山田太郎');
 assert.equal(participantName('A山田太郎2.m4a'),'A山田太郎');
 assert.equal(participantName('ＴＦ山田　太郎132239824529.m4a'),'TF山田太郎');
 assert.equal(participantName('A-01'),'A-01');
 assert.equal(personKey('A　山田 太郎11239824529.m4a'), personKey('A山田太郎'));
});
test('same display name aggregates saved recordings without changing source IDs or intervals',()=>{
 const source=['A　山田太郎1234567890','A山田 太郎2234567890','B山田太郎1234567890'].map((speaker,i)=>({id:String(i),speaker,day:`Day ${i+1}`,room:'gA',utterances:[{start:0,end:10,speechSeconds:10}]}));
 const records=normalizeParticipants(source), rows=summarize(records);
 assert.equal(totals(records).people,2);assert.equal(rows[0].seconds,20);assert.equal(rows[0].count,2);assert.equal(rows[0].average,10);
 assert.equal(rows[0].name,'A山田太郎');assert.equal(records.length,3);assert.equal(source[0].speaker,'A　山田太郎1234567890');
 assert.equal(records[1].id,source[1].id);assert.equal(records[1].utterances,source[1].utterances);
});
