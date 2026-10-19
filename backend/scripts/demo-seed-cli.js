import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const stages = ['seed-demo.js', 'seed-demo-images.js', 'seed-demo-proofs.js'];

export function parseMode(args) {
  if (args.length !== 1 || !['--write', '--verify'].includes(args[0])) {
    throw Error('DEMO_SEED_MODE_REQUIRED: use exactly one of --write or --verify');
  }
  return args[0];
}

function runStage(script, mode) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve('scripts', script), mode], {
      cwd: resolve('.'),
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => code === 0
      ? resolvePromise()
      : reject(Error(`DEMO_SEED_STAGE_FAILED:${script}:${code ?? 'UNKNOWN'}`)));
  });
}

export async function main(args = process.argv.slice(2)) {
  const mode = parseMode(args);
  for (const stage of stages) await runStage(stage, mode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    console.error(error?.message || 'DEMO_SEED_CLI_FAILED');
    process.exitCode = 1;
  }
}
