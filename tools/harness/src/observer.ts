/**
 * Server observer: a headless WebSocket client that joins a room as a
 * non-rendering peer and records every inbound frame with a receive timestamp.
 * Ground truth outside all browsers.
 */
import fs from 'node:fs';
import WebSocket from 'ws';
import type { C2S, S2C } from '@gj/shared';

export type Recorded = { t: number; msg: S2C };

export class Observer {
  frames: Recorded[] = [];
  private ws: WebSocket | null = null;
  private waiters: Array<{ pred: (r: Recorded) => boolean; resolve: (r: Recorded) => void }> = [];
  private offsetMs = 0;
  readonly url: string;
  readonly peerId: string;

  constructor(url: string, peerId = 'observer') {
    this.url = url;
    this.peerId = peerId;
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', (raw) => {
      const rec = { t: Date.now(), msg: JSON.parse(raw.toString()) as S2C };
      this.frames.push(rec);
      this.waiters = this.waiters.filter((w) => { if (w.pred(rec)) { w.resolve(rec); return false; } return true; });
    });
    await new Promise<void>((resolve, reject) => {
      this.ws!.once('open', () => resolve());
      this.ws!.once('error', reject);
    });
  }

  send(msg: C2S) { this.ws!.send(JSON.stringify(msg)); }

  async join(code: string, name = 'observer', create = false): Promise<Extract<S2C, { type: 'room' }>> {
    const p = this.next((r) => r.msg.type === 'room' || r.msg.type === 'error');
    this.send({ type: 'join', code, peerId: this.peerId, name, create });
    const r = (await p).msg;
    if (r.type === 'error') throw new Error(`join failed: ${r.code} ${r.message}`);
    return r as Extract<S2C, { type: 'room' }>;
  }

  /** Estimate server-clock offset with a few pings (lowest-RTT sample wins). */
  async syncClock(n = 5): Promise<number> {
    let best = { rtt: Infinity, offset: 0 };
    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      const p = this.next((r) => r.msg.type === 'pong' && r.msg.clientTime === t0);
      this.send({ type: 'ping', clientTime: t0 });
      const { t: t1, msg } = await p;
      const rtt = t1 - t0;
      if (rtt < best.rtt && msg.type === 'pong') best = { rtt, offset: msg.serverTime - (t0 + rtt / 2) };
    }
    this.offsetMs = best.offset;
    return best.offset;
  }

  serverNow() { return Date.now() + this.offsetMs; }

  next(pred: (r: Recorded) => boolean, timeoutMs = 10_000): Promise<Recorded> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error(`observer: timed out waiting for frame`));
      }, timeoutMs);
      const wrapped = (r: Recorded) => { clearTimeout(timer); resolve(r); };
      this.waiters.push({ pred, resolve: wrapped });
    });
  }

  ofType<T extends S2C['type']>(type: T): Array<Recorded & { msg: Extract<S2C, { type: T }> }> {
    return this.frames.filter((r) => r.msg.type === type) as Array<Recorded & { msg: Extract<S2C, { type: T }> }>;
  }

  writeJsonl(file: string) {
    fs.mkdirSync(require_dirname(file), { recursive: true });
    fs.writeFileSync(file, this.frames.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }

  close() { this.ws?.close(); }
}

function require_dirname(file: string) { return file.slice(0, Math.max(0, file.lastIndexOf('/'))) || '.'; }
