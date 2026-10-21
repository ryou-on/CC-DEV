'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clientIp } = require('../client-ip');

function request(forwarded, ip) {
  return { ip, get: name => (name.toLowerCase() === 'x-forwarded-for' ? forwarded : '') };
}

test('the rate limit uses the address Cloud Run appended', () => {
  assert.equal(clientIp(request('1.1.1.1, 203.0.113.50')), '203.0.113.50');
  assert.equal(clientIp(request('203.0.113.50')), '203.0.113.50');
  assert.notEqual(clientIp(request('1.1.1.1, 203.0.113.50')), '1.1.1.1');
  assert.equal(clientIp(request('', '198.51.100.8')), '198.51.100.8');
});
