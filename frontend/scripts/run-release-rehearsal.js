import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const fixtureScript = fileURLToPath(new URL('../../backend/scripts/e2e-release-fixture.js', import.meta.url));
const serverScript = fileURLToPath(new URL('../../backend/src/server.js', import.meta.url));
const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const frontendOrigin = process.env.E2E_RELEASE_FRONTEND_URL || 'http://127.0.0.1:5180';
const backendOrigin = process.env.E2E_RELEASE_BACKEND_URL || 'http://127.0.0.1:3210';

function run(command, args, cwd, env = process.env) {
  return spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
}

async function waitForReady(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`E2E_RELEASE_BACKEND_EXITED_${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch { /* The isolated backend is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('E2E_RELEASE_BACKEND_READY_TIMEOUT');
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

let exitCode = 1;
let setupSucceeded = false;
let backend;

const preflight = run(process.execPath, [fixtureScript, 'verify'], backendRoot);
if (preflight.status === 0) {
  const setup = run(process.execPath, [fixtureScript, 'setup'], backendRoot);
  setupSucceeded = setup.status === 0;
}

if (setupSucceeded) {
  try {
    const backendEnv = {
      ...process.env,
      NODE_ENV: 'development',
      PORT: new URL(backendOrigin).port,
      FRONTEND_URL: frontendOrigin,
      BOOKING_FLOW_VERSION: '2',
    };
    backend = spawn(process.execPath, [serverScript], {
      cwd: backendRoot,
      env: backendEnv,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
    });
    await waitForReady(`${backendOrigin}/api/v1/ready`, backend);
    const playwrightEnv = {
      ...process.env,
      E2E_BASE_URL: frontendOrigin,
      E2E_REUSE_EXISTING_SERVER: 'false',
      VITE_API_BASE_URL: `${backendOrigin}/api/v1`,
    };
    const result = run(process.execPath, [playwrightCli, 'test', '--project=release-rehearsal'], frontendRoot, playwrightEnv);
    exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'E2E_RELEASE_RUNNER_FAILED');
    exitCode = 1;
  } finally {
    await stop(backend);
    const cleanup = run(process.execPath, [fixtureScript, 'cleanup'], backendRoot);
    const postflight = run(process.execPath, [fixtureScript, 'verify'], backendRoot);
    if (cleanup.status !== 0 || postflight.status !== 0) exitCode = 1;
  }
}

process.exitCode = exitCode;
