import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/services/api';

function abortableFetch() {
  return vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
}

afterEach(() => vi.useRealTimers());

describe('API request classification', () => {
  it('maps an external AbortSignal to REQUEST_CANCELLED', async () => {
    vi.stubGlobal('fetch', abortableFetch());
    const controller = new AbortController();
    const pending = api('/health', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 0, code: 'REQUEST_CANCELLED' });
  });

  it('maps the internal 20 second deadline to REQUEST_TIMEOUT', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', abortableFetch());
    const pending = api('/health');
    const assertion = expect(pending).rejects.toMatchObject({ status: 0, code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it('maps a transport failure to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(api('/health')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
