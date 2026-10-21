'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.env.FST_E2E_EMULATOR !== '1') {
  console.error('FST_E2E_EMULATOR=1 が無いので、Auth エミュレーターへは切り替えません');
  process.exit(2);
}

process.env.FST_APPCHECK_DEBUG_TOKEN = process.env.FST_APPCHECK_DEBUG_TOKEN || 'fst-e2e-debug-token';
const shotDir = process.env.FST_E2E_SHOT_DIR || path.resolve(__dirname, '../../.e2e-shots');
fs.mkdirSync(shotDir, { recursive: true });
process.env.FST_E2E_SHOT_DIR = shotDir;

const root = path.resolve(__dirname, '../..');
const children = [];

function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
      try { child.kill('SIGTERM'); } catch (again) {}
    }
  }
}

function waitFor(url, child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout ' + url)), 180000);
    const tick = async () => {
      if (child.exitCode != null) {
        clearTimeout(timer);
        reject(new Error('exited before ' + url));
        return;
      }
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) {
          clearTimeout(timer);
          resolve();
          return;
        }
      } catch (error) {}
      setTimeout(tick, 1000);
    };
    tick();
  });
}

async function main() {
  const emulators = start('npx', [
    '--yes', 'firebase-tools@15.23.0',
    'emulators:start',
    '--only', 'auth,firestore,functions',
    '--project', 'cc-dev-ps7',
    '--config', 'firebase.e2e.json',
  ]);
  await waitFor('http://127.0.0.1:9099/', emulators);
  await waitFor('http://127.0.0.1:8080/', emulators);
  await new Promise((resolve, reject) => {
    const seed = spawn(process.execPath, [path.join(__dirname, 'seed.cjs')], {
      cwd: root, env: process.env, stdio: 'inherit',
    });
    seed.on('exit', code => (code === 0 ? resolve() : reject(new Error('seed ' + code))));
  });
  const server = start(process.execPath, [path.join(__dirname, 'serve.cjs')]);
  await waitFor('http://127.0.0.1:4173/shared/fst-client-hold.js', server);
  const playwright = spawn(path.join(__dirname, 'node_modules', '.bin', 'playwright'), ['test', '-c', path.join(__dirname, 'playwright.config.js')], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  const code = await new Promise(resolve => playwright.on('exit', resolve));
  stopAll();
  process.exit(code == null ? 1 : code);
}

main().catch(error => {
  console.error(error);
  stopAll();
  process.exit(1);
});
