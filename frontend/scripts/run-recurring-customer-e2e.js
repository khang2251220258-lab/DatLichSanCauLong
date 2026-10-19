import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const fixtureScript = fileURLToPath(new URL('../../backend/scripts/e2e-customer-fixture.js', import.meta.url));
const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const statePath = fileURLToPath(new URL('../playwright/.auth/recurring-customer-state.json', import.meta.url));

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit', shell: false });
}

let exitCode = 1;
const setup = run(process.execPath, [fixtureScript, 'setup'], backendRoot);
if (setup.status === 0) {
  try {
    const result = run(process.execPath, [
      playwrightCli, 'test',
      '--project=recurring-customer-desktop', '--project=recurring-customer-tablet', '--project=recurring-customer-mobile',
    ], frontendRoot);
    exitCode = result.status ?? 1;
  } finally {
    const cleanup = run(process.execPath, [fixtureScript, 'cleanup'], backendRoot);
    rmSync(statePath, { force: true });
    if (cleanup.status !== 0) exitCode = cleanup.status ?? 1;
  }
}
process.exitCode = exitCode;
