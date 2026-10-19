import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const fixtureScript = fileURLToPath(new URL('../../backend/scripts/e2e-owner-analytics-fixture.js', import.meta.url));
const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const statePath = fileURLToPath(new URL('../playwright/.auth/owner-analytics-state.json', import.meta.url));
const run = (command,args,cwd) => spawnSync(command,args,{cwd,env:process.env,stdio:'inherit',shell:false});

let exitCode = 1;
const setup = run(process.execPath,[fixtureScript,'setup'],backendRoot);
if (setup.status === 0) try {
  const result = run(process.execPath,[playwrightCli,'test','--project=owner-analytics-desktop','--project=owner-analytics-tablet','--project=owner-analytics-mobile'],frontendRoot);
  exitCode = result.status ?? 1;
} finally {
  const cleanup = run(process.execPath,[fixtureScript,'cleanup'],backendRoot);
  rmSync(statePath,{force:true});
  if (cleanup.status !== 0) exitCode = cleanup.status ?? 1;
}
process.exitCode = exitCode;
