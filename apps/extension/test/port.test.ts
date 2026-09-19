/**
 * ReconnectingPort's job is to keep a UI talking to the offscreen document. The
 * cases here are the two ways that quietly stopped happening in the field: a
 * service worker that never answers `beforeConnect`, and a port that connects to
 * a context which is not the offscreen document and so never says anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconnectingPort } from '../lib/port';

type Listener = (arg?: unknown) => void;

class FakePort {
  static opened: FakePort[] = [];
  readonly posted: unknown[] = [];
  disconnected = false;
  private messageListeners: Listener[] = [];
  private disconnectListeners: Listener[] = [];
  constructor(public readonly name: string) {}
  onMessage = { addListener: (fn: Listener) => { this.messageListeners.push(fn); } };
  onDisconnect = { addListener: (fn: Listener) => { this.disconnectListeners.push(fn); } };
  postMessage(m: unknown) { if (this.disconnected) throw new Error('port closed'); this.posted.push(m); }
  disconnect() { this.disconnected = true; }
  /** The other end speaks. */
  deliver(m: unknown) { for (const fn of [...this.messageListeners]) fn(m); }
  /** The other end goes away. */
  drop() { this.disconnected = true; for (const fn of [...this.disconnectListeners]) fn(); }
}

function installChrome(connect: (info: { name: string }) => FakePort) {
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { connect } };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakePort.opened = [];
  installChrome(({ name }) => { const p = new FakePort(name); FakePort.opened.push(p); return p; });
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('ReconnectingPort', () => {
  it('connects once the other end is ready and delivers messages', async () => {
    const seen: unknown[] = [];
    const port = new ReconnectingPort<string, string>('gj-popup', (m) => seen.push(m), () => {});
    await port.open();
    expect(FakePort.opened).toHaveLength(1);
    FakePort.opened[0]!.deliver('snapshot');
    expect(seen).toEqual(['snapshot']);
  });

  it('connects anyway when beforeConnect never settles', async () => {
    // The popup asks the service worker to create the offscreen document before
    // connecting. A service worker that stops answering used to wedge open() in that
    // await forever: no port, no error, and a popup stuck on its static markup.
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {}, () => new Promise<void>(() => {}));
    void port.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakePort.opened).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(FakePort.opened).toHaveLength(1);
    expect(FakePort.opened[0]!.name).toBe('gj-popup');
  });

  it('connects anyway when beforeConnect rejects', async () => {
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {}, async () => { throw new Error('no receiver'); });
    await port.open();
    expect(FakePort.opened).toHaveLength(1);
  });

  it('rebuilds a port that connects but never says anything', async () => {
    // The offscreen document posts a snapshot straight from onConnect. Silence means the
    // port landed somewhere else — the service worker holds the channel open, so
    // onDisconnect never fires and nothing would ever retry.
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {});
    await port.open();
    expect(FakePort.opened).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(FakePort.opened[0]!.disconnected).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(FakePort.opened).toHaveLength(2);
    expect(port.reconnects).toBe(1);
  });

  it('leaves a port that did say something alone', async () => {
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {});
    await port.open();
    FakePort.opened[0]!.deliver('snapshot');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakePort.opened).toHaveLength(1);
    expect(FakePort.opened[0]!.disconnected).toBe(false);
    expect(port.reconnects).toBe(0);
  });

  it('reconnects when the other end goes away, and reports it as a reconnect', async () => {
    const connected: boolean[] = [];
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, (isReconnect) => connected.push(isReconnect));
    await port.open();
    FakePort.opened[0]!.deliver('snapshot');
    FakePort.opened[0]!.drop();

    await vi.advanceTimersByTimeAsync(500);
    expect(FakePort.opened).toHaveLength(2);
    expect(connected).toEqual([false, true]);
  });

  it('queues sends made before the port exists and flushes them on connect', async () => {
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {});
    port.send('early');
    await port.open();
    expect(FakePort.opened[0]!.posted).toEqual(['early']);
  });

  it('retries when connect itself throws', async () => {
    let attempts = 0;
    installChrome(({ name }) => {
      attempts++;
      if (attempts === 1) throw new Error('Extension context invalidated');
      const p = new FakePort(name);
      FakePort.opened.push(p);
      return p;
    });
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {});
    await port.open();
    expect(FakePort.opened).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(500);
    expect(FakePort.opened).toHaveLength(1);
  });

  it('stops everything once closed', async () => {
    const port = new ReconnectingPort<string, string>('gj-popup', () => {}, () => {});
    await port.open();
    port.close();
    expect(FakePort.opened[0]!.disconnected).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakePort.opened).toHaveLength(1);
  });
});
