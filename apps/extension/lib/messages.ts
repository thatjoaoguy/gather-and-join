/**
 * Internal messages between extension contexts.
 *
 * Transport:
 *  - Content script ⇄ offscreen: a long-lived `chrome.runtime.connect` Port
 *    named PORT_PLAYER. The port dies with the page; the offscreen document does not.
 *  - Popup ⇄ offscreen: a Port named PORT_POPUP.
 *  - Anyone → background: `chrome.runtime.sendMessage({target: 'background', ...})`.
 *  - Background → offscreen: `chrome.runtime.sendMessage({target: 'offscreen', ...})`.
 */
import type { PeerId, PeerInfo, RoomState } from '@gaj/shared';
import type { Sabotage } from './constants';
import { kvGet } from './kv';

export const PORT_PLAYER = 'gaj-player';
export const PORT_POPUP = 'gaj-popup';

export type PeerMediaState = {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  hasAudio: boolean;
  hasVideo: boolean;
  /** Derived locally from the peer's audio level; held briefly so it does not flicker. */
  speaking: boolean;
  /** Self-reported over the wire; null until the peer has told us. */
  micOn: boolean | null;
  camOn: boolean | null;
};

/** Reachability of the configured server, from a probe (connect + one ping) or the live socket. */
export type ServerStatus = {
  url: string;
  host: string;
  state: 'unknown' | 'checking' | 'reachable' | 'unreachable';
  rttMs: number | null;
  checkedAt: number | null;
};

/** Everything the UI or a content script needs to know, owned by the offscreen document. */
export type Snapshot = {
  serverUrl: string;
  socket: 'disconnected' | 'connecting' | 'connected';
  /** A join is in flight (room not yet confirmed by the server). */
  joining: boolean;
  socketReconnects: number;
  offsetMs: number;
  room: RoomState | null;
  peers: PeerInfo[];
  yourPeerId: PeerId | null;
  isLeader: boolean;
  micOn: boolean;
  camOn: boolean;
  /** Our own speech detector, regardless of ducking. */
  speaking: boolean;
  server: ServerStatus;
  micPermission: 'unknown' | 'granted' | 'denied';
  camPermission: 'unknown' | 'granted' | 'denied';
  /** Who last reported a stall, for the "X is buffering" UI. */
  stalledBy: { peerId: PeerId; name: string } | null;
  peerMedia: Record<PeerId, PeerMediaState>;
  lastError: { code: string; message: string } | null;
};

// ---- content script → offscreen (over PORT_PLAYER) -------------------------
export type PlayerToOffscreen =
  | { type: 'hello'; contentId: string | null; url: string }
  | { type: 'playback'; paused: boolean; positionMs: number }
  | { type: 'stalled' }
  | { type: 'navigateRequest'; contentId: string; url: string }
  | { type: 'loopback:signal'; payload: unknown }
  | { type: 'loopback:want'; want: boolean }
  /** A diagnostics line from the page's ring buffer (pages have no session storage of their own). */
  | { type: 'log'; line: string }
  // Test-only
  | { type: 'test:createRoom'; code: string; name: string }
  | { type: 'test:joinRoom'; code: string; name: string }
  | { type: 'test:leaveRoom' }
  | { type: 'test:setCamera'; on: boolean }
  | { type: 'test:setMic'; on: boolean }
  | { type: 'test:getDiag'; id: number }
  | { type: 'test:resetAudioGaps' }
  | { type: 'test:dropSocket' };

// ---- offscreen → content script (over PORT_PLAYER) -------------------------
export type OffscreenToPlayer =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'playback'; paused: boolean; positionMs: number; serverTime: number; originPeerId: PeerId; offsetMs: number }
  | { type: 'navigate'; contentId: string; watchUrl: string | null; originPeerId: PeerId }
  | { type: 'duck'; ducked: boolean }
  | { type: 'loopback:signal'; payload: unknown }
  | { type: 'loopback:tracks'; tracks: Array<{ peerId: PeerId; name: string; streamId: string }> }
  | { type: 'test:diag'; id: number; diag: Diag };

// ---- popup → offscreen (over PORT_POPUP) -----------------------------------
export type PopupToOffscreen =
  | { type: 'createRoom'; name: string }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'leaveRoom' }
  | { type: 'setMic'; on: boolean }
  | { type: 'setCamera'; on: boolean }
  | { type: 'setServerUrl'; url: string }
  | { type: 'probeServer' };

export type OffscreenToPopup = { type: 'snapshot'; snapshot: Snapshot };

// ---- runtime.sendMessage envelopes -----------------------------------------
export type ToBackground =
  | { target: 'background'; type: 'ensureOffscreen' }
  | { target: 'background'; type: 'openPage'; url: string }
  | { target: 'background'; type: 'grantMic' }
  | { target: 'background'; type: 'grantCamera' }
  | { target: 'background'; type: 'getActiveTabUrl' }
  | { target: 'background'; type: 'kv:get'; area: 'local' | 'session'; keys: string[] | null }
  | { target: 'background'; type: 'kv:set'; area: 'local' | 'session'; data: Record<string, unknown> };

export type ToOffscreen =
  | { target: 'offscreen'; type: 'navigation'; tabId: number; url: string; contentId: string | null }
  | { target: 'offscreen'; type: 'getSnapshot' }
  | { target: 'offscreen'; type: 'getPeerStats' }
  | { target: 'offscreen'; type: 'micGranted' }
  | { target: 'offscreen'; type: 'cameraGranted' }
  | { target: 'offscreen'; type: 'setDucking'; enabled: boolean }
  | { target: 'offscreen'; type: 'setServerUrl'; url: string }
  | { target: 'offscreen'; type: 'probeServer' };

/** Diagnostics mirrored into chrome.storage.session and served to the test hook. */
export type Diag = {
  socketReconnects: number;
  peerStats: Record<PeerId, PeerStats>;
  remoteAudio: Record<PeerId, { peakHz: number; level: number; lastAudibleAt: number; maxGapMs: number }>;
  remoteVideo: Record<PeerId, { rgb: [number, number, number] | null; framesDecoded: number }>;
  localMicLevel: number;
  ducked: boolean;
};

export type PeerStats = {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  bytesReceived: number;
  bytesSent: number;
  framesDecoded: number;
  audioPacketsReceived: number;
};

export async function readTestConfig(): Promise<{ sabotage: Sabotage; testPeerId: string | null; serverUrl: string | null }> {
  if (!__GAJ_TEST__) return { sabotage: null, testPeerId: null, serverUrl: null };
  const v = await kvGet('local', ['sabotage', 'testPeerId', 'serverUrl']);
  return {
    sabotage: (v.sabotage as Sabotage) ?? null,
    testPeerId: (v.testPeerId as string) ?? null,
    serverUrl: (v.serverUrl as string) ?? null,
  };
}
