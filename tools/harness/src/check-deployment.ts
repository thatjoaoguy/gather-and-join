/**
 * Checks a *deployed* server, over the network, the way a participant reaches it.
 *
 *   pnpm --filter @gj/harness check:deployment https://your-server.example.com
 *
 * The Playwright suite covers the code against localhost. This covers the things
 * only a real deployment can get wrong: TLS, a proxy that mangles the WebSocket
 * upgrade, a platform quietly running two copies of the server, and a text
 * encoding that is only wrong once a browser decodes it. A unit test asserting a
 * response body cannot see any of them.
 *
 * Exits non-zero if any check fails, so it can gate a release or a hosting choice.
 */
import WebSocket from 'ws';
import type { C2S, S2C } from '@gj/shared';

const base = process.argv[2]?.replace(/\/$/, '');
if (!base) {
  console.error('usage: check-deployment <https://host>   (HOLD_MS=90000 to hold the socket longer)');
  process.exit(2);
}
const wsBase = base.replace(/^http/, 'ws');
/** A room code nobody else is using; Crockford base32, so no I L O U. */
const code = 'CHK' + Math.floor(Math.random() * 900 + 100);
const HOLD_MS = Number(process.env.HOLD_MS ?? 90_000);

let failures = 0;
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failures++;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

class Client {
  private ws: WebSocket;
  private inbox: S2C[] = [];
  private waiters: Array<{ pred: (m: S2C) => boolean; resolve: (m: S2C) => void }> = [];
  closed = false;

  constructor(peerId: string) {
    this.ws = new WebSocket(wsBase, { headers: { 'user-agent': `gj-check/${peerId}` } });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as S2C;
      this.inbox.push(msg);
      this.waiters = this.waiters.filter((w) => { if (w.pred(msg)) { w.resolve(msg); return false; } return true; });
    });
    this.ws.on('close', () => { this.closed = true; });
  }
  open() {
    return new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', (e) => reject(e));
    });
  }
  send(msg: C2S) { this.ws.send(JSON.stringify(msg)); }
  next<T extends S2C['type']>(type: T, timeoutMs = 15_000): Promise<Extract<S2C, { type: T }>> {
    const seen = this.inbox.find((m) => m.type === type);
    if (seen) return Promise.resolve(seen as never);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
      this.waiters.push({ pred: (m) => m.type === type, resolve: (m) => { clearTimeout(t); resolve(m as never); } });
    });
  }
  close() { this.ws.close(); }
}

// ---- HTTP surface -------------------------------------------------------------------
// Also the wake-up call: a sleeping free instance answers this one slowly.
const started = Date.now();
const healthRes = await fetch(`${base}/health`);
const firstByteMs = Date.now() - started;
const health = await healthRes.json() as { status?: string; version?: string; rooms?: number; peers?: number };
check('/health answers 200', healthRes.status === 200, `${firstByteMs}ms, ${JSON.stringify(health)}`);
check('/health reports a released version', typeof health.version === 'string' && health.version !== 'dev', String(health.version));

const rootRes = await fetch(`${base}/`);
const rootBody = await rootRes.text();
check('/ is the plain-text page', rootRes.status === 200 && rootBody.includes('running'), rootBody.split('\n')[0] ?? '');
// An unlabelled text/plain body is decoded as windows-1252 by browsers, which turns
// the em dash in that page into mojibake. Only a real response shows this.
check('/ declares utf-8', (rootRes.headers.get('content-type') ?? '').includes('charset=utf-8'), rootRes.headers.get('content-type') ?? '(none)');
check('/ survives the round trip as utf-8', rootBody.includes('—'));

// ---- WebSocket surface --------------------------------------------------------------
const a = new Client('a');
await a.open();
check('WebSocket upgrade accepted', true, wsBase);

a.send({ type: 'join', code, peerId: 'a', name: 'A', create: true });
const room = await a.next('room');
check('a room can be created', room.state.code === code && room.isLeader, `code=${code}`);

// The one a browser cannot tell you. If the platform runs more than one copy of the
// server, these two land in different process memories and never see each other —
// same room code, no error, an empty room.
const b = new Client('b');
await b.open();
b.send({ type: 'join', code, peerId: 'b', name: 'B' });
const joined = await Promise.race([
  a.next('peerJoined').then(() => true),
  b.next('error').then(() => false),
]);
check('a second client reaches the same process', joined,
  joined ? 'peers=2' : 'the platform is running more than one copy; rooms are split');

if (joined) {
  const relayed = a.next('playback');
  b.send({ type: 'playback', paused: false, positionMs: 4242, clientTime: Date.now() });
  const frame = await relayed.catch(() => null);
  check('playback relays between peers', frame?.positionMs === 4242, frame ? `positionMs=${frame.positionMs}` : 'no frame arrived');

  const live = await (await fetch(`${base}/health`)).json() as { rooms?: number; peers?: number };
  check('/health sees the live room', (live.rooms ?? 0) >= 1 && (live.peers ?? 0) >= 2, JSON.stringify(live));
}

// A proxy that closes idle connections, or an instance that sleeps under us, shows up
// here and nowhere else. Clients re-sync the clock every 60s, so hold longer than that.
console.log(`\n  holding the connection for ${Math.round(HOLD_MS / 1000)}s…`);
const holdStarted = Date.now();
while (Date.now() - holdStarted < HOLD_MS && !a.closed) {
  await new Promise((r) => setTimeout(r, 15_000));
  if (a.closed) break;
  a.send({ type: 'ping', clientTime: Date.now() });
  await a.next('pong', 10_000).catch(() => null);
}
check(`the connection survived ${Math.round(HOLD_MS / 1000)}s`, !a.closed);

a.close(); b.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
