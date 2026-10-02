import {test} from 'node:test';import assert from 'node:assert/strict';
import {personKey,uniquePerson,parseSubtitles,syncCandidates,attachSubtitles} from '../src/sync.js';
test('visible names normalize but ambiguous matches and group numeric IDs stay distinct',()=>{
 assert.equal(personKey('audioA 山田 太郎1234567890.m4a'),personKey('A 山田太郎'));
 assert.notEqual(personKey('A-01'),personKey('B-01'));
 assert.equal(uniquePerson('山田太郎',['山田 太郎','山田太郎']),null);
 assert.equal(uniquePerson('A 山田太郎',['山田 太郎']),'山田 太郎');
});
test('subtitle timestamps and voice labels match without counting speech twice',()=>{
 const cues=parseSubtitles('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v 山田>歯周病の説明</v>\n\n00:00:04.000 --> 00:00:06.000\n佐藤: 別話者\n\n00:00:20.000 --> 00:00:22.000\n山田: 区間外');
 assert.equal(cues.length,3);assert.equal(cues[0].speaker,'山田');
 const record={id:'one',speaker:'山田',utterances:[{start:11,end:14,speechSeconds:3,text:'original'}]};
 const result=attachSubtitles(record,cues,10);assert.equal(result.matched,1);assert.equal(result.otherSpeaker,1);assert.equal(result.outside,1);assert.equal(result.utterances[0].text,'original');assert.equal(result.utterances[0].speechSeconds,3);assert.equal(result.utterances[0].syncedText,'歯周病の説明');
 assert.equal(syncCandidates(cues,'x.vtt',[record,{...record,id:'two'}]).length,2);
 assert.deepEqual(parseSubtitles('時刻のない文章'),[]);
});
