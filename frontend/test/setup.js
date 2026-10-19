import { afterEach, beforeEach, expect, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { clearPublicSnapshots } from '../src/services/publicReadCache';
import { clearProtectedSnapshots } from '../src/services/protectedReadCache';
let storage;
configure({ asyncUtilTimeout: 3000 });
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
  storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage forbidden'); });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:payment-preview');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => {
  cleanup();
  clearPublicSnapshots();
  clearProtectedSnapshots();
  expect(storage).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});
