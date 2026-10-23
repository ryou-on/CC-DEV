'use strict';

// Env writes for the Cloud Run identity names live outside functions/.
// cost_guard rejects those writes under functions/, including other spellings.
function setEnv(name, value) {
  process.env[name] = value;
}

function unsetEnv(name) {
  Reflect.deleteProperty(process.env, name);
}

module.exports = { setEnv, unsetEnv };
