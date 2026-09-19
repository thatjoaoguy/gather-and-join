/**
 * The offscreen document has no chrome.storage, so every read and write is a message
 * to the service worker. These cover what happens when that worker is slow, restarting
 * or wedged — the last of which used to hang the caller forever, taking the room's
 * rejoin record and the diagnostics log down with it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kvGet, kvSet } from '../lib/kv';

type Send = (msg: Record<string, unknown>) => Promise<unknown>;

function installChrome(opts: { storage?: boolean; send?: Send } = {}) {
  const sent: Record<string, unknown>[] = [];
  const send: Send = (m) => { sent.push(m); return opts.send ? opts.send(m) : Promise.resolve(undefined); };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: send },
    ...(opts.storage ? { storage: { local: { get: vi.fn(async () => ({ a: 1 })), set: vi.fn(async () => {}) }, session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } } } : {}),
  };
  return { sent };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('kv', () => {
  it('uses chrome.storage directly where there is one', async () => {
    installChrome({ storage: true });
    await expect(kvGet('local', ['a'])).resolves.toEqual({ a: 1 });
    const store = (globalThis as unknown as { chrome: { storage: { local: { get: ReturnType<typeof vi.fn> } } } }).chrome.storage.local;
    expect(store.get).toHaveBeenCalledWith(['a']);
  });

  it('proxies through the service worker where there is none', async () => {
    const { sent } = installChrome({ send: async () => ({ serverUrl: 'wss://house' }) });
    await expect(kvGet('local', ['serverUrl'])).resolves.toEqual({ serverUrl: 'wss://house' });
    expect(sent).toEqual([{ target: 'background', type: 'kv:get', area: 'local', keys: ['serverUrl'] }]);
  });

  it('gives up rather than hanging when the worker never answers', async () => {
    // The failure behind a popup that never rendered and a diagnostics log that stayed
    // empty: sendMessage to a wedged worker stays pending instead of rejecting.
    installChrome({ send: () => new Promise<never>(() => {}) });
    const read = kvGet('session', ['gjDesiredRoom']);
    const settled = vi.fn();
    void read.then(settled, settled);

    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).not.toHaveBeenCalled(); // still working through its attempts

    await vi.advanceTimersByTimeAsync(5000);
    await expect(read).rejects.toThrow(/no answer from the service worker/);
  });

  it('retries a worker that misses once and then answers', async () => {
    let calls = 0;
    installChrome({ send: async () => { calls++; return calls === 1 ? undefined : { gjReconnects: 4 }; } });
    const read = kvGet('session', ['gjReconnects']);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(read).resolves.toEqual({ gjReconnects: 4 });
    expect(calls).toBe(2);
  });

  it('retries a worker that rejects while it restarts', async () => {
    let calls = 0;
    installChrome({ send: async () => { calls++; if (calls === 1) throw new Error('Receiving end does not exist'); return true; } });
    const write = kvSet('session', { gjDesiredRoom: { code: 'RM0001' } });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(write).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('reports a write the worker refused', async () => {
    installChrome({ send: async () => false });
    const write = kvSet('session', { gjDesiredRoom: null });
    const caught = write.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(caught).resolves.toMatch(/refused by chrome.storage/);
  });
});
