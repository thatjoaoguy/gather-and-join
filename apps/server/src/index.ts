/**
 * Gather & Join signaling + sync server. Single file, no database, no auth.
 *
 * Sees room metadata and signaling frames only — never media. Rooms are
 * ephemeral: they expire ROOM_TTL_MS after the last participant leaves.
 *
 * Env:
 *   PORT               listen port (default 8080)
 *   ROOM_TTL_MS        override room expiry (tests)
 *   WATCH_URL_TEMPLATE fallback for building `watchUrl` from a contentId when neither the
 *                      client nor the shared `watchUrlFor` knows it, e.g. "http://localhost:4173/watch/{contentId}"
 *   GAJ_LOG=0          silence the event log (one line per room event on stdout)
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  parseC2S, applyPlayback, applyNavigate, createRoomState, isValidRoomCode, watchUrlFor as canonicalWatchUrl,
  ROOM_TTL_MS as DEFAULT_ROOM_TTL_MS,
  type C2S, type S2C, type RoomState, type PeerId, type PeerInfo, type ErrorCode, type MediaFlags,
} from '@gaj/shared';

type Peer = { peerId: PeerId; name: string; socket: WebSocket; joinedAt: number; seq: number; media?: MediaFlags };
type Room = { state: RoomState; peers: Map<PeerId, Peer>; expiry: NodeJS.Timeout | null; leaderGrace: NodeJS.Timeout | null };

const PORT = Number(process.env.PORT ?? 8080);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS ?? DEFAULT_ROOM_TTL_MS);
/** How long a disconnected leader keeps leadership, so a network blip doesn't hand the room to someone else. */
const LEADER_GRACE_MS = Number(process.env.LEADER_GRACE_MS ?? 60_000);
const WATCH_URL_TEMPLATE = process.env.WATCH_URL_TEMPLATE ?? null;

const rooms = new Map<string, Room>();
/** Which room+peer a socket belongs to; a socket is in at most one room. */
const membership = new WeakMap<WebSocket, { code: string; peerId: PeerId }>();
/** Sockets we terminated ourselves (heartbeat), so their close is attributed correctly. */
const killed = new WeakSet<WebSocket>();
let joinSeq = 0;

const now = () => Date.now();

// ---- event log -----------------------------------------------------------------------
// One line per room event, key=value, greppable. There is no analytics service behind
// this: stdout is the whole story, and it is the only record the server keeps.
//   2026-09-18T20:01:02.345Z peer_joined room=RM0001 peer=a name=Ana peers=2 leader=a
type LogValue = string | number | boolean | null | undefined;
type LogSink = (line: string) => void;
let logSink: LogSink = process.env.GAJ_LOG === '0' ? () => {} : (line) => process.stdout.write(line + '\n');

function logEvent(event: string, fields: Record<string, LogValue> = {}) {
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'string' && !/^[\w:./@-]*$/.test(v) ? JSON.stringify(v) : String(v)}`)
    .join(' ');
  logSink(`${new Date().toISOString()} ${event}${kv ? ' ' + kv : ''}`);
}

function send(socket: WebSocket, msg: S2C) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}
function sendError(socket: WebSocket, code: ErrorCode, message: string) {
  send(socket, { type: 'error', code, message });
}
function broadcast(room: Room, msg: S2C, except?: PeerId) {
  const data = JSON.stringify(msg);
  for (const p of room.peers.values()) {
    if (p.peerId !== except && p.socket.readyState === WebSocket.OPEN) p.socket.send(data);
  }
}
function peerList(room: Room): PeerInfo[] {
  return [...room.peers.values()].map(({ peerId, name, media }) => (media ? { peerId, name, media } : { peerId, name }));
}
function watchUrlFor(contentId: string, supplied: string | null | undefined): string | null {
  return supplied ?? canonicalWatchUrl(contentId) ?? WATCH_URL_TEMPLATE?.replace('{contentId}', encodeURIComponent(contentId)) ?? null;
}
function roomOf(socket: WebSocket): { room: Room; peer: Peer } | null {
  const m = membership.get(socket);
  if (!m) return null;
  const room = rooms.get(m.code);
  const peer = room?.peers.get(m.peerId);
  return room && peer ? { room, peer } : null;
}

function scheduleExpiry(room: Room) {
  if (room.expiry) clearTimeout(room.expiry);
  room.expiry = setTimeout(() => {
    if (room.peers.size === 0) { rooms.delete(room.state.code); logEvent('room_expired', { room: room.state.code }); }
  }, ROOM_TTL_MS);
  room.expiry.unref?.();
}

function handleJoin(socket: WebSocket, msg: Extract<C2S, { type: 'join' }>) {
  if (membership.has(socket)) leave(socket);
  const code = msg.code.toUpperCase();
  const reject = (err: ErrorCode, message: string) => {
    logEvent('join_rejected', { room: code, peer: msg.peerId, error: err });
    return sendError(socket, err, message);
  };
  if (!isValidRoomCode(code)) return reject('BAD_MESSAGE', 'invalid room code');
  let room = rooms.get(code);
  if (msg.create) {
    if (room) return reject('ROOM_EXISTS', 'room code already in use');
    room = { state: createRoomState(code, msg.peerId, now()), peers: new Map(), expiry: null, leaderGrace: null };
    rooms.set(code, room);
    logEvent('room_created', { room: code, peer: msg.peerId, name: msg.name, rooms: rooms.size });
  } else if (!room) {
    return reject('ROOM_NOT_FOUND', 'no room with that code');
  }
  const stale = room.peers.get(msg.peerId);
  if (stale) {
    // A client reconnecting after a silent network drop: the old socket is dead
    // but we never saw it close. The peer id is the identity; take over.
    if (stale.socket === socket) return reject('PEER_ID_TAKEN', 'already joined');
    membership.delete(stale.socket);
    room.peers.delete(msg.peerId);
    try { stale.socket.terminate(); } catch { /* already gone */ }
    logEvent('peer_evicted', { room: code, peer: msg.peerId, reason: 'rejoin' });
    broadcast(room, { type: 'peerLeft', peerId: msg.peerId, leaderId: room.state.leaderId });
  }
  if (room.expiry) { clearTimeout(room.expiry); room.expiry = null; }

  const peer: Peer = { peerId: msg.peerId, name: msg.name, socket, joinedAt: now(), seq: ++joinSeq };
  room.peers.set(peer.peerId, peer);
  membership.set(socket, { code, peerId: peer.peerId });
  if (room.state.leaderId === peer.peerId && room.leaderGrace) {
    // The leader is back within the grace period: leadership was never reassigned.
    clearTimeout(room.leaderGrace); room.leaderGrace = null;
  } else if (!room.peers.has(room.state.leaderId) && !room.leaderGrace) {
    // A room whose leader left for good (or a re-created one) takes the newcomer as leader.
    if (room.state.leaderId !== peer.peerId) logEvent('leader_changed', { room: code, from: room.state.leaderId, to: peer.peerId, reason: 'newcomer' });
    room.state = { ...room.state, leaderId: peer.peerId };
  }
  logEvent('peer_joined', { room: code, peer: peer.peerId, name: peer.name, peers: room.peers.size, leader: room.state.leaderId });

  send(socket, {
    type: 'room', state: room.state, peers: peerList(room),
    yourPeerId: peer.peerId, isLeader: room.state.leaderId === peer.peerId,
  });
  broadcast(room, { type: 'peerJoined', peerId: peer.peerId, name: peer.name }, peer.peerId);
}

function leave(socket: WebSocket, reason: 'leave' | 'close' | 'error' | 'heartbeat' = 'leave') {
  const ctx = roomOf(socket);
  membership.delete(socket);
  if (!ctx) return;
  const { room, peer } = ctx;
  room.peers.delete(peer.peerId);
  logEvent('peer_left', { room: room.state.code, peer: peer.peerId, name: peer.name, reason, peers: room.peers.size, leader: room.state.leaderId });
  if (room.state.leaderId === peer.peerId && room.peers.size > 0 && !room.leaderGrace) {
    // Hold leadership for a while: a dropped socket is usually a blip, and the
    // leader rejoins with the same id. Only then does the oldest peer inherit.
    room.leaderGrace = setTimeout(() => {
      room.leaderGrace = null;
      if (room.peers.has(room.state.leaderId) || room.peers.size === 0) return;
      const oldest = [...room.peers.values()].sort((a, b) => a.seq - b.seq)[0]!;
      logEvent('leader_changed', { room: room.state.code, from: room.state.leaderId, to: oldest.peerId, reason: 'grace_expired' });
      room.state = { ...room.state, leaderId: oldest.peerId };
      broadcast(room, { type: 'leader', leaderId: oldest.peerId });
    }, LEADER_GRACE_MS);
    room.leaderGrace.unref?.();
  }
  broadcast(room, { type: 'peerLeft', peerId: peer.peerId, leaderId: room.state.leaderId });
  if (room.peers.size === 0) scheduleExpiry(room);
}

function handleMessage(socket: WebSocket, raw: RawData) {
  let parsed: unknown;
  try { parsed = JSON.parse(raw.toString()); } catch { logEvent('bad_message', { reason: 'not_json' }); return sendError(socket, 'BAD_MESSAGE', 'not JSON'); }
  const msg = parseC2S(parsed);
  if (!msg) { logEvent('bad_message', { reason: 'unrecognised', frameType: typeof (parsed as any)?.type === 'string' ? (parsed as any).type : null }); return sendError(socket, 'BAD_MESSAGE', 'unrecognised frame'); }

  if (msg.type === 'join') return handleJoin(socket, msg);
  if (msg.type === 'ping') return send(socket, { type: 'pong', clientTime: msg.clientTime, serverTime: now() });
  if (msg.type === 'leave') return leave(socket);

  const ctx = roomOf(socket);
  if (!ctx) return sendError(socket, 'NOT_IN_ROOM', 'join a room first');
  const { room, peer } = ctx;
  const t = now();

  switch (msg.type) {
    case 'hello': {
      // First peer to declare content sets it; later peers just report where they are.
      if (room.state.contentId === null && msg.contentId) {
        room.state = applyNavigate(room.state, msg.contentId, watchUrlFor(msg.contentId, msg.watchUrl), t);
        logEvent('content_set', { room: room.state.code, peer: peer.peerId, content: msg.contentId });
        broadcast(room, { type: 'navigate', contentId: msg.contentId, watchUrl: room.state.watchUrl, originPeerId: peer.peerId });
      }
      return;
    }
    case 'playback': {
      if (msg.reason === 'stall') logEvent('stall', { room: room.state.code, peer: peer.peerId, name: peer.name, positionMs: Math.round(msg.positionMs) });
      room.state = applyPlayback(room.state, { paused: msg.paused, positionMs: msg.positionMs }, t);
      return broadcast(room, {
        type: 'playback', paused: msg.paused, positionMs: msg.positionMs, serverTime: t, originPeerId: peer.peerId,
        ...(msg.reason ? { reason: msg.reason } : {}),
      });
    }
    case 'navigate': {
      if (room.state.leaderId !== peer.peerId) {
        logEvent('navigate_rejected', { room: room.state.code, peer: peer.peerId, content: msg.contentId, leader: room.state.leaderId });
        return sendError(socket, 'NOT_LEADER', 'only the leader may change content');
      }
      logEvent('navigate', { room: room.state.code, peer: peer.peerId, content: msg.contentId });
      room.state = applyNavigate(room.state, msg.contentId, watchUrlFor(msg.contentId, msg.watchUrl), t);
      return broadcast(room, { type: 'navigate', contentId: msg.contentId, watchUrl: room.state.watchUrl, originPeerId: peer.peerId });
    }
    case 'media': {
      // Self-reported mic/camera state, remembered for late joiners and relayed to everyone else.
      peer.media = { micOn: msg.micOn, camOn: msg.camOn };
      return broadcast(room, { type: 'media', from: peer.peerId, micOn: msg.micOn, camOn: msg.camOn }, peer.peerId);
    }
    case 'signal': {
      const target = room.peers.get(msg.to);
      if (!target) { logEvent('signal_dropped', { room: room.state.code, from: peer.peerId, to: msg.to }); return sendError(socket, 'NO_SUCH_PEER', `no peer ${msg.to} in room`); }
      // Relayed verbatim; SDP is never inspected.
      return send(target.socket, { type: 'signal', from: peer.peerId, payload: msg.payload });
    }
  }
}

const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 30_000);

export function startServer(port = PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (socket) => {
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    socket.on('message', (raw) => { alive.set(socket, true); handleMessage(socket, raw); });
    socket.on('close', () => leave(socket, killed.has(socket) ? 'heartbeat' : 'close'));
    socket.on('error', () => leave(socket, 'error'));
  });
  // Sockets that stop answering pings (a dead tunnel, a sleeping laptop) are
  // dropped so the room learns about it instead of waiting for a TCP timeout.
  const beat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) { killed.add(socket); socket.terminate(); continue; }
      alive.set(socket, false);
      try { socket.ping(); } catch { /* closing */ }
    }
  }, HEARTBEAT_MS);
  beat.unref?.();
  wss.on('close', () => clearInterval(beat));
  wss.on('listening', () => logEvent('listening', { url: `ws://localhost:${port}`, roomTtlMs: ROOM_TTL_MS, leaderGraceMs: LEADER_GRACE_MS }));
  return wss;
}

/** Test-only introspection. */
export function _rooms() { return rooms; }
/** Test-only: capture event-log lines instead of writing them to stdout. */
export function _setLogSink(sink: LogSink) { logSink = sink; }

if (process.argv[1] && /index\.ts$/.test(process.argv[1]) && process.env.GAJ_NO_AUTOSTART !== '1') {
  startServer();
}
