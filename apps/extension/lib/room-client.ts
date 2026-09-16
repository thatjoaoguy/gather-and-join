/**
 * The one WebSocket. Lives in the offscreen document only. Reconnects with
 * backoff and re-joins the desired room; counts reconnects so tests can assert
 * a navigation never caused one.
 */
import { estimateOffset, PING_SAMPLES, OFFSET_REFRESH_MS, type C2S, type S2C, type PingSample } from '@gaj/shared';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected';
export type DesiredRoom = { code: string; peerId: string; name: string; create: boolean };

export class RoomClient {
  private ws: WebSocket | null = null;
  private desired: DesiredRoom | null = null;
  private backoff = 500;
  private pendingPongs = new Map<number, (s: PingSample) => void>();
  private offsetTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUs = false;
  status: SocketStatus = 'disconnected';
  reconnects = 0;
  offsetMs = 0;
  rttMs = 0;

  constructor(
    public url: string,
    private readonly onFrame: (msg: S2C) => void,
    private readonly onStatus: (status: SocketStatus) => void,
    /** Called when a connection attempt fails before ever reaching the server. */
    private readonly onConnectFailed: (url: string) => void = () => {},
  ) {}

  /** Join (or create) a room; opens the socket if needed. */
  join(desired: DesiredRoom) {
    this.desired = desired;
    if (this.status === 'connected') this.sendJoin();
    else this.connect();
  }

  /** Re-send the join for the desired room (after an error), optionally as a create. */
  rejoin(create = false) {
    if (!this.desired) return;
    this.desired = { ...this.desired, create };
    if (this.status === 'connected') this.sendJoin(); else this.connect();
  }

  leave() {
    this.desired = null;
    this.send({ type: 'leave' });
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
    if (this.offsetTimer) { clearInterval(this.offsetTimer); this.offsetTimer = null; }
  }

  /** Test seam: kill the socket as a network drop would (no leave frame). */
  dropForTest() { this.ws?.close(); }

  send(msg: C2S) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setStatus(s: SocketStatus) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  private connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.closedByUs = false;
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = async () => {
      if (this.ws !== ws) return;
      this.backoff = 500;
      this.setStatus('connected');
      await this.syncClock();
      this.offsetTimer ??= setInterval(() => this.syncClock(), OFFSET_REFRESH_MS);
      this.sendJoin();
    };
    ws.onmessage = (ev) => {
      let msg: S2C;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'pong') {
        const w = this.pendingPongs.get(msg.clientTime);
        if (w) { this.pendingPongs.delete(msg.clientTime); w({ clientTime: msg.clientTime, serverTime: msg.serverTime, receivedAt: Date.now() }); }
        return;
      }
      this.onFrame(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const neverOpened = this.status === 'connecting';
      this.ws = null;
      if (neverOpened && this.desired) this.onConnectFailed(this.url);
      if (this.offsetTimer) { clearInterval(this.offsetTimer); this.offsetTimer = null; }
      this.setStatus('disconnected');
      if (this.closedByUs || !this.desired) return;
      this.reconnects++;
      // Re-join, never re-create: the room outlives our socket.
      this.desired = { ...this.desired, create: false };
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 5000);
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private sendJoin() {
    if (!this.desired) return;
    const { code, peerId, name, create } = this.desired;
    this.send({ type: 'join', code, peerId, name, create });
  }

  /** 5 sequential ping/pong round trips; the lowest-RTT sample wins. */
  async syncClock(): Promise<void> {
    const samples: PingSample[] = [];
    for (let i = 0; i < PING_SAMPLES; i++) {
      const s = await this.ping();
      if (s) samples.push(s);
    }
    const est = estimateOffset(samples);
    if (est) { this.offsetMs = est.offsetMs; this.rttMs = est.rttMs; }
  }

  private ping(): Promise<PingSample | null> {
    return new Promise((resolve) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return resolve(null);
      let t = Date.now();
      while (this.pendingPongs.has(t)) t++; // clientTime doubles as the correlation key
      const timer = setTimeout(() => { this.pendingPongs.delete(t); resolve(null); }, 2000);
      this.pendingPongs.set(t, (s) => { clearTimeout(timer); resolve(s); });
      this.send({ type: 'ping', clientTime: t });
    });
  }
}
