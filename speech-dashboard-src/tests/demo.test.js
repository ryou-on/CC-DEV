import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO, DEMO_PEOPLE } from '../src/demo.js';
test('demo has 32 unique people, 8 per room, three rounds each day and valid intervals', () => {
 assert.equal(new Set(DEMO_PEOPLE.map(p=>p.speaker)).size,32);
 for(const day of ['Day 1','Day 2','Day 3']) {
  assert.equal(DEMO.filter(r=>r.day===day && r.room==='Main').length,32);
  for(const room of ['Room A','Room B','Room C','Room D']) for(const session of ['ワーク1','ワーク2','ワーク3']) assert.equal(DEMO.filter(r=>r.day===day && r.room===room && r.session===session).length,8);
 }
 for(const r of DEMO) for(const u of r.utterances) assert.ok(u.start>=0 && u.end<=r.duration && u.end>u.start);
});
