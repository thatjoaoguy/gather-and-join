/** A runtime Port that reconnects when the other side goes away. */
export class ReconnectingPort<Out, In> {
  private port: chrome.runtime.Port | null = null;
  private closed = false;
  private queue: Out[] = [];
  reconnects = 0;

  constructor(
    private readonly name: string,
    private readonly onMessage: (msg: In) => void,
    private readonly onConnected: (isReconnect: boolean) => void,
    private readonly beforeConnect: () => Promise<void> = async () => {},
  ) {}

  async open() {
    if (this.closed) return;
    try { await this.beforeConnect(); } catch { /* retry below */ }
    if (this.closed) return;
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: this.name });
    } catch {
      setTimeout(() => this.open(), 500);
      return;
    }
    const isReconnect = this.reconnects > 0;
    this.port = port;
    port.onMessage.addListener((m) => this.onMessage(m as In));
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      if (this.closed) return;
      this.reconnects++;
      setTimeout(() => this.open(), 500);
    });
    this.onConnected(isReconnect);
    for (const m of this.queue.splice(0)) this.send(m);
  }

  send(msg: Out) {
    if (!this.port) { this.queue.push(msg); return; }
    try { this.port.postMessage(msg); } catch { this.queue.push(msg); }
  }

  close() {
    this.closed = true;
    this.port?.disconnect();
    this.port = null;
  }
}
