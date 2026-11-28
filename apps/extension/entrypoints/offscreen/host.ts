/**
 * The long-lived host: owns the WebSocket, every RTCPeerConnection, the mic,
 * remote audio playback, and the diagnostics the test hook reads. On Chrome it
 * is mounted in the offscreen document (the only context that survives
 * navigation); on Firefox, which has no offscreen API, the persistent MV2
 * background page mounts it directly.
 *
 * This file is wiring only. Room logic is `RoomSession`; transport is
 * `RoomClient`; the mesh is `Mesh`; page loopbacks are `LoopbackSender`.
 */
import type { C2S, PeerId, S2C } from '@gj/shared';
import { DEFAULT_SERVER_URL } from '../../lib/constants';
import {
  PORT_CALL, PORT_PLAYER, PORT_POPUP, readTestConfig,
  type Diag, type FromCallTab, type ToCallTab, type OffscreenToPlayer, type OffscreenToPopup, type PeerStats, type PlayerToOffscreen, type PopupToOffscreen, type Snapshot, type ToBackground, type ToOffscreen,
} from '../../lib/messages';
import { BadgeReporter, type BadgeState } from '../../lib/badge';
import { RoomClient } from '../../lib/room-client';
import { RoomSession, type HealthResult, type ProbeResult } from '../../lib/room-session';
import { Mesh } from '../../lib/mesh';
import { LocalMedia } from '../../lib/local-media';
import { RemoteMedia } from '../../lib/remote-media';
import { LoopbackSender } from '../../lib/loopback-sender';
import { TabCapture } from '../../lib/tab-capture';
import { PerfectPeer } from '../../lib/perfect-peer';
import { appendLogLine, log } from '../../lib/log';
import { kvGet, kvSet } from '../../lib/kv';

export type HostOptions = {
  /** Where a badge state goes: the service worker on Chrome, chrome.action itself on Firefox. */
  reportBadge: (state: BadgeState) => Promise<unknown>;
  /**
   * Firefox only: open and close the pinned call tab that captures the mic and camera,
   * since its background page may not (lib/tab-capture.ts). Absent on Chrome, where the
   * offscreen document captures them itself.
   */
  callTab?: { open(): Promise<void>; close(): void };
};
export type OffscreenHost = { handle(msg: ToOffscreen): Promise<unknown> };

/** Chrome: the offscreen document reports to the service worker over a one-shot message. */
export const reportBadgeToWorker = (state: BadgeState): Promise<unknown> => {
  const msg: ToBackground = { target: 'background', type: 'badge', state };
  return chrome.runtime.sendMessage(msg);
};

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
    case 'welcome': log('room', '← welcome', `server=${m.version}`); return;
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

// Long enough for a request Render holds while it boots the server (~12 s) to come back as `up`.
const HEALTH_TIMEOUT_MS = 20_000;

export function mountOffscreenHost(opts: HostOptions): OffscreenHost {
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

  /**
   * The toolbar badge belongs to the service worker (`chrome.action` is out of reach
   * here), so the connection state is posted to it. Only on a change: the snapshot
   * fires far too often to wake the worker on each one.
   */
  const badge = new BadgeReporter((state: BadgeState) => {
    try { void opts.reportBadge(state).catch(() => { /* cosmetic; the worker re-derives on its next cold start */ }); }
    catch (e) { log('offscreen', 'badge report failed', state, String(e)); }
  });

  const tabCapture: TabCapture | undefined = opts.callTab && new TabCapture({
    openTab: () => { log('offscreen', 'opening the call tab'); return opts.callTab!.open(); },
    closeTab: () => { log('offscreen', 'closing the call tab'); opts.callTab!.close(); },
    inRoom: (): boolean => session.snapshot.room !== null || session.snapshot.joining,
    createPeer: (signal) => new PerfectPeer(true, signal, { iceServers: [] }),
    onLost: (kinds) => { log('offscreen', 'call tab closed; lost', kinds.join(', ')); session.deviceLost(kinds); },
  });
  const local = new LocalMedia((speaking) => session.onSpeaking(speaking), tabCapture);
  const remote = new RemoteMedia((peerId, speaking) => session.onPeerSpeaking(peerId, speaking));

  const session = new RoomSession(
    {
      createClient: (url, h) => {
        // The session points this client at the configured server on join (client.url),
        // so log where it is now, not the default it was created with.
        const client: TracedRoomClient = new TracedRoomClient(
          url,
          (m) => { traceFrame(m); h.onFrame(m); },
          (status) => { log('room', 'socket', status, client.url); h.onStatus(status); },
          (failed) => { log('room', 'connect failed', failed); h.onConnectFailed(failed); },
        );
        return client;
      },
      createMesh: (myId, h, opts) => {
        const mesh = new Mesh(myId, h.sendSignal, h.onTrack, (id) => { tracePeerState(id, mesh.peers.get(id)?.pp.pc); h.onStateChange(id); }, opts?.iceServers);
        return mesh;
      },
      probe: probeServer,
      health: checkHealth,
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
      snapshot: (snapshot) => { badge.update(snapshot); toEveryone({ type: 'snapshot', snapshot }); },
      playback: (e) => toPlayers({ type: 'playback', ...e }),
      navigate: (e) => toPlayers({ type: 'navigate', ...e }),
      duck: (ducked) => toPlayers({ type: 'duck', ducked }),
      videoAdded: ({ peerId, name, track, stream }) => { for (const lb of loopbacks.values()) lb.add(peerId, name, track, stream); },
      videoRemoved: (peerId) => { for (const lb of loopbacks.values()) lb.remove(peerId); },
    },
  );

  /**
   * Reachability probe: open a socket, send a ping, close on the first frame back. A
   * current server greets with its version before the pong; an older one only pongs.
   */
  function probeServer(url: string): Promise<ProbeResult> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { resolve({ ok: false, rttMs: null, version: null }); return; }
      const t0 = Date.now();
      const done = (ok: boolean, version: string | null = null) => { clearTimeout(timer); try { ws.close(); } catch { /* closed */ } resolve({ ok, rttMs: ok ? Date.now() - t0 : null, version }); };
      const timer = setTimeout(() => done(false), 4000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'ping', clientTime: t0 }));
      ws.onmessage = (ev) => {
        let msg: S2C | null = null;
        try { msg = JSON.parse(ev.data); } catch { /* not ours; still an answer */ }
        done(true, msg?.type === 'welcome' ? msg.version : null);
      };
      ws.onerror = () => done(false);
      ws.onclose = () => done(false);
    });
  }

  /**
   * `GET /health` at the socket's address, from this document's own origin. The server lets
   * any origin read it, so a 200 saying `status: ok` is the server itself. Anything else
   * that answers only proves the address is alive: a free host's holding page while it
   * boots the server, or an older server without the header, which the browser hides
   * behind an opaque response (the second, `no-cors` request tells that apart from a
   * dead address). A request a proxy holds open until the server is up counts as alive too.
   */
  async function checkHealth(url: string): Promise<HealthResult> {
    let target: string;
    try {
      const u = new URL(url);
      target = `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}${u.pathname.replace(/\/$/, '')}/health`;
    } catch { return 'down'; }
    const timedOut = (e: unknown) => e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
    try {
      const res = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      if (!res.ok) return 'answered';
      const body = await res.json().catch(() => null) as { status?: unknown } | null;
      return body?.status === 'ok' ? 'up' : 'answered';
    } catch (e) {
      if (timedOut(e)) return 'answered';
    }
    try {
      await fetch(target, { cache: 'no-store', mode: 'no-cors', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      return 'answered';
    } catch (e) {
      return timedOut(e) ? 'answered' : 'down';
    }
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
    } else if (port.name === PORT_CALL && tabCapture) {
      tabCapture.attach({
        post: (m: ToCallTab) => { try { port.postMessage(m); } catch (e) { log('offscreen', 'post failed', port.name, m.type, String(e)); } },
        onMessage: (fn) => port.onMessage.addListener((m: FromCallTab) => fn(m)),
        onDisconnect: (fn) => port.onDisconnect.addListener(fn),
        disconnect: () => port.disconnect(),
      });
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
      case 'stalled': session.stalled(m.positionMs); return;
      case 'navigateRequest': session.navigateRequest(m.contentId, m.url); return;
      case 'duration': session.reportDuration(m.contentId, m.durationMs); return;
      case 'episodeStart': session.setEpisodeStart(m.contentId, m.start); return;
      case 'setMic': session.setMic(m.on); return;
      case 'setCamera': await session.setCamera(m.on); return;
      case 'loopback:want': if (m.want) ensureLoopback(port); else dropLoopback(port); return;
      case 'loopback:signal': void ensureLoopback(port).handle(m.payload as never); return;
      case 'test:createRoom': if (__GJ_TEST__) await session.createRoom(m.name, m.code); return;
      case 'test:joinRoom': if (__GJ_TEST__) await session.joinRoom(m.code, m.name); return;
      case 'test:leaveRoom': if (__GJ_TEST__) session.leaveRoom(); return;
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

  function handle(msg: ToOffscreen): Promise<unknown> {
    switch (msg.type) {
      case 'navigation': session.setContent({ contentId: msg.contentId, url: msg.url }); return Promise.resolve(true);
      case 'getSnapshot': return Promise.resolve(session.snapshot);
      case 'getPeerStats': return collectDiag().then((d) => d.peerStats);
      case 'cameraGranted': session.cameraGranted(); return Promise.resolve(true);
      case 'micGranted': void session.micGranted(); return Promise.resolve(true);
      case 'setDucking': session.setDucking(!!msg.enabled); return Promise.resolve(true);
      case 'setServerUrl': return session.setServerUrl(msg.url).then(() => true);
      case 'probeServer': return session.probeServer().then(() => session.snapshot.server);
    }
  }

  chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
    if (!msg || msg.target !== 'offscreen') return;
    void handle(msg).then(sendResponse, () => sendResponse(undefined));
    return true;
  });

  log('offscreen', 'boot');
  void session.boot();
  return { handle };
}
