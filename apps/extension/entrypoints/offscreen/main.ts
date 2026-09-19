/**
 * Offscreen document: the only context that survives navigation. Owns the
 * WebSocket, every RTCPeerConnection, the mic, remote audio playback, and the
 * diagnostics the test hook reads.
 *
 * This file is wiring only. Room logic is `RoomSession`; transport is
 * `RoomClient`; the mesh is `Mesh`; page loopbacks are `LoopbackSender`.
 */
import type { C2S, PeerId, S2C } from '@gj/shared';
import { DEFAULT_SERVER_URL } from '../../lib/constants';
import {
  PORT_PLAYER, PORT_POPUP, readTestConfig,
  type Diag, type OffscreenToPlayer, type OffscreenToPopup, type PeerStats, type PlayerToOffscreen, type PopupToOffscreen, type Snapshot, type ToOffscreen,
} from '../../lib/messages';
import { RoomClient } from '../../lib/room-client';
import { RoomSession } from '../../lib/room-session';
import { Mesh } from '../../lib/mesh';
import { LocalMedia } from '../../lib/local-media';
import { RemoteMedia } from '../../lib/remote-media';
import { LoopbackSender } from '../../lib/loopback-sender';
import { appendLogLine, log } from '../../lib/log';
import { kvGet, kvSet } from '../../lib/kv';

// ---- diagnostics tracing ---------------------------------------------------------------
// The session and transport stay free of logging; everything notable crosses one of
// these seams, so the trace is taken here. Playback, ping/pong and signaling are
// left out (too chatty); stalls are the exception.

/** RoomClient whose outbound room-level frames land in the diagnostics log. */
class TracedRoomClient extends RoomClient {
  override send(msg: C2S) {
    switch (msg.type) {
      case 'join': log('room', msg.create ? '→ join (create)' : '→ join', msg.code, 'as', msg.peerId); break;
      case 'hello': log('room', '→ hello', msg.contentId); break;
      case 'navigate': log('room', '→ navigate', msg.contentId); break;
      case 'leave': log('room', '→ leave'); break;
      case 'playback': if (msg.reason === 'stall') log('room', '→ stall at', Math.round(msg.positionMs)); break;
      default: break;
    }
    super.send(msg);
  }
}

function traceFrame(m: S2C) {
  switch (m.type) {
    case 'room': log('room', '← room', m.state.code, `peers=${m.peers.length}`, `leader=${m.state.leaderId}${m.isLeader ? ' (me)' : ''}`, `content=${m.state.contentId ?? '-'}`); return;
    case 'peerJoined': log('room', '← peerJoined', m.peerId, m.name); return;
    case 'peerLeft': log('room', '← peerLeft', m.peerId, `leader=${m.leaderId}`); return;
    case 'leader': log('room', '← leader', m.leaderId); return;
    case 'navigate': log('room', '← navigate', m.contentId, 'from', m.originPeerId); return;
    case 'playback': if (m.reason === 'stall') log('room', '← stall from', m.originPeerId, 'at', Math.round(m.positionMs)); return;
    case 'error': log('room', '← error', m.code, m.message); return;
    case 'signal': case 'pong': return;
  }
}

/** Peer connection state, logged only when it actually changes. */
const lastPeerState = new Map<PeerId, string>();
function tracePeerState(peerId: PeerId, pc: RTCPeerConnection | undefined) {
  if (!pc) { lastPeerState.delete(peerId); return; }
  const state = `${pc.connectionState}/${pc.iceConnectionState}/${pc.signalingState}`;
  if (lastPeerState.get(peerId) === state) return;
  lastPeerState.set(peerId, state);
  log('rtc', peerId, state);
}

// ---- ports ---------------------------------------------------------------------------

const playerPorts = new Set<chrome.runtime.Port>();
const popupPorts = new Set<chrome.runtime.Port>();
const loopbacks = new Map<chrome.runtime.Port, LoopbackSender>();

function post(port: chrome.runtime.Port, m: OffscreenToPlayer | OffscreenToPopup) {
  // A throw here is not always a dead port: a payload that will not structured-clone
  // fails the same way, and silently losing the snapshot leaves a UI blank with no
  // trace anywhere. Say so, then carry on — one bad port must not stop the others.
  try { port.postMessage(m); } catch (e) { log('offscreen', 'post failed', port.name, m.type, String(e)); }
}
function toPlayers(m: OffscreenToPlayer) { for (const p of playerPorts) post(p, m); }
function toEveryone(m: { type: 'snapshot'; snapshot: Snapshot }) { for (const p of playerPorts) post(p, m); for (const p of popupPorts) post(p, m); }

// ---- the session -----------------------------------------------------------------------

const local = new LocalMedia((speaking) => session.onSpeaking(speaking));
const remote = new RemoteMedia((peerId, speaking) => session.onPeerSpeaking(peerId, speaking));

const session = new RoomSession(
  {
    createClient: (url, h) => new TracedRoomClient(
      url,
      (m) => { traceFrame(m); h.onFrame(m); },
      (status) => { log('room', 'socket', status, url); h.onStatus(status); },
      (url) => { log('room', 'connect failed', url); h.onConnectFailed(url); },
    ),
    createMesh: (myId, h, opts) => {
      const mesh = new Mesh(myId, h.sendSignal, h.onTrack, (id) => { tracePeerState(id, mesh.peers.get(id)?.pp.pc); h.onStateChange(id); }, opts?.iceServers);
      return mesh;
    },
    probe: probeServer,
    local, remote,
    // This document has no chrome.storage of its own, so every read and write is a
    // round-trip to the service worker. The session stays free of logging and of
    // storage failure handling; both live here, at the seam.
    kv: {
      get: (area, keys) => kvGet(area, keys).catch((e) => { log('offscreen', 'storage read failed', area, String(e)); return {}; }),
      set: (area, data) => kvSet(area, data).catch((e) => { log('offscreen', 'storage write failed', area, Object.keys(data).join(','), String(e)); }),
    },
    readTestConfig,
    defaultServerUrl: DEFAULT_SERVER_URL,
  },
  {
    snapshot: (snapshot) => toEveryone({ type: 'snapshot', snapshot }),
    playback: (e) => toPlayers({ type: 'playback', ...e }),
    navigate: (e) => toPlayers({ type: 'navigate', ...e }),
    duck: (ducked) => toPlayers({ type: 'duck', ducked }),
    videoAdded: ({ peerId, name, track, stream }) => { for (const lb of loopbacks.values()) lb.add(peerId, name, track, stream); },
    videoRemoved: (peerId) => { for (const lb of loopbacks.values()) lb.remove(peerId); },
  },
);

/** Reachability probe: open a socket, exchange one ping, close. */
function probeServer(url: string): Promise<{ ok: boolean; rttMs: number | null }> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { resolve({ ok: false, rttMs: null }); return; }
    const t0 = Date.now();
    const done = (ok: boolean) => { clearTimeout(timer); try { ws.close(); } catch { /* closed */ } resolve({ ok, rttMs: ok ? Date.now() - t0 : null }); };
    const timer = setTimeout(() => done(false), 4000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'ping', clientTime: t0 }));
    ws.onmessage = () => done(true);
    ws.onerror = () => done(false);
    ws.onclose = () => done(false);
  });
}

// ---- loopbacks: one per player port -------------------------------------------------------

function ensureLoopback(port: chrome.runtime.Port): LoopbackSender {
  let lb = loopbacks.get(port);
  if (lb) return lb;
  lb = new LoopbackSender((payload) => post(port, { type: 'loopback:signal', payload }), (tracks) => post(port, { type: 'loopback:tracks', tracks }));
  loopbacks.set(port, lb);
  for (const v of session.liveVideos()) lb.add(v.peerId, v.name, v.track, v.stream);
  return lb;
}
function dropLoopback(port: chrome.runtime.Port) {
  loopbacks.get(port)?.close();
  loopbacks.delete(port);
}

// ---- diagnostics -------------------------------------------------------------------------

async function collectDiag(): Promise<Diag> {
  const peerStats: Record<PeerId, PeerStats> = {};
  const framesDecoded: Record<PeerId, number> = {};
  for (const [id, e] of session.mesh?.peers ?? []) {
    const pc = e.pp.pc;
    const st: PeerStats = { connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState, signalingState: pc.signalingState, bytesReceived: 0, bytesSent: 0, framesDecoded: 0, audioPacketsReceived: 0 };
    try {
      const report = await pc.getStats();
      report.forEach((r: any) => {
        if (r.type === 'inbound-rtp') {
          st.bytesReceived += r.bytesReceived ?? 0;
          if (r.kind === 'video') st.framesDecoded += r.framesDecoded ?? 0;
          if (r.kind === 'audio') st.audioPacketsReceived += r.packetsReceived ?? 0;
        }
        if (r.type === 'outbound-rtp') st.bytesSent += r.bytesSent ?? 0;
      });
    } catch { /* closed */ }
    peerStats[id] = st;
    framesDecoded[id] = st.framesDecoded;
  }
  const pixels = remote.videoPixels();
  const remoteVideo: Diag['remoteVideo'] = {};
  for (const id of Object.keys(pixels)) remoteVideo[id] = { rgb: pixels[id] ?? null, framesDecoded: framesDecoded[id] ?? 0 };
  return { socketReconnects: session.snapshot.socketReconnects, peerStats, remoteAudio: remote.audioPeaks(), remoteVideo, localMicLevel: local.level, ducked: session.ducked };
}
setInterval(() => { void collectDiag().then((diag) => kvSet('session', { gjDiag: diag })).catch(() => { /* reported by the log's own write */ }); }, __GJ_TEST__ ? 250 : 2000);

// ---- port messages ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  log('offscreen', 'port connected', port.name);
  if (port.name === PORT_PLAYER) {
    playerPorts.add(port);
    post(port, { type: 'snapshot', snapshot: session.snapshot });
    if (session.ducked) post(port, { type: 'duck', ducked: true });
    port.onMessage.addListener((m: PlayerToOffscreen) => { onPlayerMessage(port, m).catch((e) => log('offscreen', 'player message failed', m.type, String(e?.stack ?? e))); });
    port.onDisconnect.addListener(() => { playerPorts.delete(port); dropLoopback(port); });
  } else if (port.name === PORT_POPUP) {
    popupPorts.add(port);
    post(port, { type: 'snapshot', snapshot: session.snapshot });
    port.onMessage.addListener((m: PopupToOffscreen) => { onPopupMessage(m).catch((e) => log('offscreen', 'popup message failed', m.type, String(e?.stack ?? e))); });
    port.onDisconnect.addListener(() => popupPorts.delete(port));
  }
});

async function onPlayerMessage(port: chrome.runtime.Port, m: PlayerToOffscreen) {
  if (m.type !== 'playback' && m.type !== 'test:getDiag' && m.type !== 'log' && m.type !== 'loopback:signal') log('offscreen', 'player →', m.type);
  switch (m.type) {
    case 'log': appendLogLine(m.line); return;
    case 'hello':
      session.setContent({ contentId: m.contentId, url: m.url });
      post(port, { type: 'snapshot', snapshot: session.snapshot });
      return;
    case 'playback': session.playback(m.paused, m.positionMs); return;
    case 'stalled': session.stalled(); return;
    case 'navigateRequest': session.navigateRequest(m.contentId, m.url); return;
    case 'loopback:want': if (m.want) ensureLoopback(port); else dropLoopback(port); return;
    case 'loopback:signal': void ensureLoopback(port).handle(m.payload as never); return;
    case 'test:createRoom': if (__GJ_TEST__) await session.createRoom(m.name, m.code); return;
    case 'test:joinRoom': if (__GJ_TEST__) await session.joinRoom(m.code, m.name); return;
    case 'test:leaveRoom': if (__GJ_TEST__) session.leaveRoom(); return;
    case 'test:setCamera': if (__GJ_TEST__) await session.setCamera(m.on); return;
    case 'test:setMic': if (__GJ_TEST__) session.setMic(m.on); return;
    case 'test:getDiag': if (__GJ_TEST__) post(port, { type: 'test:diag', id: m.id, diag: await collectDiag() }); return;
    case 'test:resetAudioGaps': if (__GJ_TEST__) remote.resetAudioGaps(); return;
    case 'test:dropSocket': if (__GJ_TEST__) session.dropSocketForTest(); return;
  }
}

async function onPopupMessage(m: PopupToOffscreen) {
  switch (m.type) {
    case 'createRoom': await session.createRoom(m.name); return;
    case 'joinRoom': await session.joinRoom(m.code, m.name); return;
    case 'leaveRoom': session.leaveRoom(); return;
    case 'setMic': session.setMic(m.on); return;
    case 'setCamera': await session.setCamera(m.on); return;
    case 'setServerUrl': await session.setServerUrl(m.url); return;
    case 'probeServer': await session.probeServer(); return;
  }
}

// ---- one-shot messages (service worker, options page) ------------------------------------------

chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  switch (msg.type) {
    case 'navigation': session.setContent({ contentId: msg.contentId, url: msg.url }); sendResponse(true); return;
    case 'getSnapshot': sendResponse(session.snapshot); return;
    case 'getPeerStats': void collectDiag().then((d) => sendResponse(d.peerStats)); return true;
    case 'cameraGranted': session.cameraGranted(); sendResponse(true); return;
    case 'micGranted': void session.micGranted(); sendResponse(true); return;
    case 'setDucking': session.setDucking(!!msg.enabled); sendResponse(true); return;
    case 'setServerUrl': void session.setServerUrl(msg.url).then(() => sendResponse(true)); return true;
    case 'probeServer': void session.probeServer().then(() => sendResponse(session.snapshot.server)); return true;
  }
});

log('offscreen', 'boot');
void session.boot();
