/**
 * Shared guard for the proposal migration scripts.
 * Prints whether the target is a demo- project and whether the credential file
 * is a production service account, then asks the operator to type the project ID.
 * A write proceeds only when the typed text matches the target exactly.
 */
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function gcloudConfiguredProject() {
  if (process.env.CLOUDSDK_CORE_PROJECT) return process.env.CLOUDSDK_CORE_PROJECT;
  const root = process.env.CLOUDSDK_CONFIG || join(homedir(), '.config', 'gcloud');
  let active = 'default';
  const activeFile = join(root, 'active_config');
  if (existsSync(activeFile)) active = readFileSync(activeFile, 'utf8').trim() || 'default';
  const cfg = join(root, 'configurations', `config_${active}`);
  if (!existsSync(cfg)) return null;
  const match = readFileSync(cfg, 'utf8').match(/^project\s*=\s*(\S+)/m);
  return match ? match[1] : null;
}

export function loadCredentialIdentity() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  const adc = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  const path = fromEnv || (existsSync(adc) ? adc : '');
  if (!path) return { source: 'none', kind: 'none', projectId: null, production: 'no' };
  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { source: path, kind: 'unreadable', projectId: null, production: 'unknown', error: e.message };
  }
  const kind = json.type || 'unknown';
  let projectId = json.project_id || json.quota_project_id || null;
  if (!projectId && kind === 'authorized_user') projectId = gcloudConfiguredProject();
  let production = 'unknown';
  if (projectId) production = String(projectId).startsWith('demo-') ? 'no' : 'yes';
  else if (kind === 'none') production = 'no';
  return { source: path, kind, projectId, production };
}

export function describeTarget(projectId) {
  const cred = loadCredentialIdentity();
  const demo = String(projectId || '').startsWith('demo-');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
  const production = cred.production || 'unknown';
  const lines = [
    `target project: ${projectId}`,
    `target is a demo- project: ${demo ? 'yes' : 'no'}`,
    `firestore emulator: ${emulator || 'no'}`,
    `credentials: ${cred.kind} project_id=${cred.projectId || '(none)'} source=${cred.source}`,
    `credentials are production: ${production}`,
  ];
  if (cred.projectId && cred.projectId !== projectId) {
    lines.push(`credential project_id (${cred.projectId}) does not match target (${projectId})`);
  }
  if (emulator) {
    lines.push('Firestore client uses the emulator host above, not the credential project.');
  }
  return { demo, emulator, production, cred, text: lines.join('\n') };
}

export function readConfirmationLine() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value);
    };
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.once('line', (line) => finish(line));
    rl.once('close', () => finish(''));
  });
}

export async function confirmProjectWrite(projectId, purpose) {
  const report = describeTarget(projectId);
  console.log(report.text);
  console.log(purpose || 'Type the target project ID exactly to write. Any other input aborts:');
  const typed = await readConfirmationLine();
  if (typed !== projectId) {
    console.error(`Refusing to write: confirmation ${JSON.stringify(typed)} did not match target ${JSON.stringify(projectId)}.`);
    return false;
  }
  console.log('confirmation matched the target project ID');
  return true;
}

// Returns false when the process must exit before any Firestore client is created.
export async function authorizeBeforeFirestore({ projectId, write, onEmu, allowProduction, backupAck }) {
  const report = describeTarget(projectId);
  console.log(report.text);
  if (!report.demo && !allowProduction) {
    console.error('Refusing a non-demo project without --allow-production. No Firestore client was created.');
    return false;
  }
  if (write && !onEmu && !backupAck) {
    console.error('Refusing to write outside the emulator without --i-have-a-backup. No Firestore client was created.');
    return false;
  }
  if (report.cred.production === 'unknown' && !onEmu) {
    console.log('Credential project is unknown. Confirmation is required before any read.');
  }
  if (!onEmu) {
    console.log('Type the target project ID exactly to read or write. Any other input aborts:');
    const typed = await readConfirmationLine();
    if (typed !== projectId) {
      console.error(`Refusing: confirmation ${JSON.stringify(typed)} did not match target ${JSON.stringify(projectId)}. No Firestore client was created.`);
      return false;
    }
    console.log('confirmation matched the target project ID');
  }
  return true;
}
