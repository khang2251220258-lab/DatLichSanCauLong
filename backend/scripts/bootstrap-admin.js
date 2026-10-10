// Explicit interactive CLI only. Never imported by server startup.
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { bootstrapAdmin } from './admin-bootstrap-service.js';
function hiddenPassword() {
  return new Promise((resolve, reject) => {
    let value = '';
    emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
    const finish = (error) => { process.stdin.off('keypress', onKey); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); error ? reject(error) : resolve(value); };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('CANCELLED'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = [...value].slice(0, -1).join('');
      else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}
let prisma;
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const full_name = await prompt.question('Admin full name: ');
  const email = await prompt.question('Admin email: ');
  prompt.close();
  process.stdout.write('Admin password (hidden): '); const password = await hiddenPassword();
  ({ prisma } = await import('../src/config/prisma.js'));
  await bootstrapAdmin(prisma, { full_name, email, password });
  console.log('ADMIN BOOTSTRAP: CREATED');
} catch (error) {
  const safe = new Set(['EMAIL_ALREADY_EXISTS', 'VALIDATION_ERROR', 'INTERACTIVE_TERMINAL_REQUIRED', 'CANCELLED']);
  console.error('ADMIN BOOTSTRAP: FAILED (' + (safe.has(error.code) ? error.code : safe.has(error.message) ? error.message : 'BOOTSTRAP_ERROR') + ')');
  process.exitCode = 1;
} finally { if (prisma) await prisma.$disconnect(); }
