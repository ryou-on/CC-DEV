'use strict';

module.exports = {
  testDir: __dirname,
  timeout: 120000,
  expect: { timeout: 70000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
  },
};
