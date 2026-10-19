import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMode } from '../scripts/demo-seed-cli.js';

test('demo seed CLI accepts one explicit mode', () => {
  assert.equal(parseMode(['--write']), '--write');
  assert.equal(parseMode(['--verify']), '--verify');
});

test('demo seed CLI rejects missing, mixed, and unknown modes', () => {
  assert.throws(() => parseMode([]), /DEMO_SEED_MODE_REQUIRED/);
  assert.throws(() => parseMode(['--write', '--verify']), /DEMO_SEED_MODE_REQUIRED/);
  assert.throws(() => parseMode(['--check']), /DEMO_SEED_MODE_REQUIRED/);
});
