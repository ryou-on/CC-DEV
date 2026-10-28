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

export function loadCredentialIdentity() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  const adc = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  const path = fromEnv || (existsSync(adc) ? adc : '');
  if (!path) return { source: 'none', kind: 'none', projectId: null };
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    return {
      source: path,
      kind: json.type || 'unknown',
      projectId: json.project_id || json.quota_project_id || null,
    };
  } catch (e) {
    return { source: path, kind: 'unreadable', projectId: null, error: e.message };
  }
}

export function describeTarget(projectId) {
  const cred = loadCredentialIdentity();
  const demo = String(projectId || '').startsWith('demo-');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
  const production = cred.kind === 'service_account'
    && !!cred.projectId
    && !String(cred.projectId).startsWith('demo-');
  const lines = [
    `target project: ${projectId}`,
    `target is a demo- project: ${demo ? 'yes' : 'no'}`,
    `firestore emulator: ${emulator || 'no'}`,
    `credentials: ${cred.kind} project_id=${cred.projectId || '(none)'} source=${cred.source}`,
    `credentials are production: ${production ? 'yes' : 'no'}`,
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

export async function confirmProjectWrite(projectId) {
  const report = describeTarget(projectId);
  console.log(report.text);
  console.log('Type the target project ID exactly to write. Any other input aborts:');
  const typed = await readConfirmationLine();
  if (typed !== projectId) {
    console.error(`Refusing to write: confirmation ${JSON.stringify(typed)} did not match target ${JSON.stringify(projectId)}.`);
    return false;
  }
  console.log('confirmation matched the target project ID');
  return true;
}
