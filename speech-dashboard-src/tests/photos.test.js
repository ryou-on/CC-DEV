import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBounds } from '../src/photos.js';
test('square crop stays inside wide and tall screenshots at every edge', () => {
  for (const [width, height] of [[400, 200], [200, 400]]) {
    for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) for (const size of [3, 25, 100]) {
      const b = cropBounds(width, height, x, y, size);
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.side <= width && b.y + b.side <= height);
    }
  }
  assert.deepEqual(cropBounds(400, 200, 25, 50, 50), { x: 50, y: 50, side: 100 });
});
