'use strict';

const policy = require('./editor-policy.json');

function isEditorEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value.endsWith(String(policy.domainSuffix).toLowerCase())
    || policy.emails.some(item => item.toLowerCase() === value);
}

module.exports = { policy, isEditorEmail };
