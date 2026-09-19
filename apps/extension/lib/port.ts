/** A runtime Port that reconnects when the other side goes away. */

/**
 * How long `beforeConnect` gets before we connect anyway. Preparing the other end
 * (creating the offscreen document) is an optimisation, not a precondition: the
 * service worker ensures it from its own `onConnect` too, and a port that lands
 * nowhere is retried below. A service worker that stops answering must not be able
 * to wedge a UI — a popup is built fresh on every click, so it is the first thing
 * to break when one does.
 */
const BEFORE_CONNECT_MS = 1000;
/**
 * The offscreen document posts a snapshot synchronously from `onConnect`, on both
 * port names. Silence past this means the port reached some other context (the
 * service worker keeps the channel open, so `onDisconnect` never fires) and has to
 * be rebuilt rather than waited on.
 */
const FIRST_MESSAGE_MS = 2000;
const RETRY_MS = 500;

export class ReconnectingPort<Out, In> {
  private port: chrome.runtime.Port | null = null;
  private closed = false;
  private queue: Out[] = [];
  private opening = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  reconnects = 0;

  constructor(
    private readonly name: string,
    private readonly onMessage: (msg: In) => void,
    private readonly onConnected: (isReconnect: boolean) => void,
    private readonly beforeConnect: () => Promise<void> = async () => {},
  ) {}

  async open() {
    if (this.closed || this.port || this.opening) return;
    this.opening = true;
    try {
      await this.settledWithin(this.beforeConnect(), BEFORE_CONNECT_MS);
      if (this.closed || this.port) return;
      let port: chrome.runtime.Port;
      try {
        port = chrome.runtime.connect({ name: this.name });
      } catch {
        this.retry();
        return;
      }
      const isReconnect = this.reconnects > 0;
      this.port = port;
      const watchdog = this.after(FIRST_MESSAGE_MS, () => {
        if (this.port !== port) return;
        // Nobody on the other end; disconnecting ourselves does not fire onDisconnect.
        this.port = null;
        try { port.disconnect(); } catch { /* already gone */ }
        this.reconnects++;
        this.retry();
      });
      port.onMessage.addListener((m) => { this.clear(watchdog); this.onMessage(m as In); });
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return;
        this.clear(watchdog);
        this.port = null;
        if (this.closed) return;
        this.reconnects++;
        this.retry();
      });
      this.onConnected(isReconnect);
      for (const m of this.queue.splice(0)) this.send(m);
    } finally {
      this.opening = false;
    }
  }

  send(msg: Out) {
    if (!this.port) { this.queue.push(msg); return; }
    try { this.port.postMessage(msg); } catch { this.queue.push(msg); }
  }

  close() {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.port?.disconnect();
    this.port = null;
  }

  private retry() {
    this.after(RETRY_MS, () => void this.open());
  }

  private after(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.closed) fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  private clear(t: ReturnType<typeof setTimeout>) {
    if (!this.timers.delete(t)) return;
    clearTimeout(t);
  }

  /**
   * Resolves when `p` settles or `ms` elapses, whichever comes first; never rejects,
   * and resolves even once closed so `open()` cannot be left half-way through.
   */
  private settledWithin(p: Promise<unknown>, ms: number): Promise<void> {
    return new Promise((resolve) => {
      // Deliberately not registered for cancellation: a close() mid-wait must still let
      // open() finish and bail on its own `closed` check rather than stall in the await.
      const t = setTimeout(resolve, ms);
      const done = () => { clearTimeout(t); resolve(); };
      p.then(done, done);
    });
  }
}
