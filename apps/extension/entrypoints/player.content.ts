/**
 * Player content script. Dies on every navigation, caches nothing across them.
 * Wiring only: the provider adapter finds the <video>, VideoBinding tracks it,
 * SyncEngine keeps it in step with the room, PartySidebar shows the peers, and
 * a Port relays everything to the offscreen document.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { parseContentId, PLAYER_MATCHES } from '@gaj/shared';
import { PORT_PLAYER, readTestConfig, type Diag, type OffscreenToPlayer, type PlayerToOffscreen, type Snapshot } from '../lib/messages';
import { adapterForHost, isHarnessHost } from '../lib/providers';
import { participantsFrom } from '../lib/participants';
import { VideoBinding } from '../lib/video-binding';
import { SyncEngine } from '../lib/sync-engine';
import { Ducker } from '../lib/ducking';
import { UpNextSuppressor } from '../lib/up-next';
import { ReconnectingPort } from '../lib/port';
import { installTestBridge } from '../lib/test-bridge';
import { PartySidebar } from '../lib/sidebar/party-sidebar';
import { installLogSink, log } from '../lib/log';

export default defineContentScript({
  matches: [...PLAYER_MATCHES],
  runAt: 'document_idle',
  async main() {
    const adapter = adapterForHost(location.hostname);
    if (!adapter) return;
    const cfg = await readTestConfig();
    const contentId = () => parseContentId(location.href);
    let snapshot: Snapshot | null = null;

    const port = new ReconnectingPort<PlayerToOffscreen, OffscreenToPlayer>(
      PORT_PLAYER,
      (m) => onOffscreenMessage(m),
      (isReconnect) => {
        log('page', isReconnect ? 'port reconnected; hello' : 'hello', contentId() ?? '-', location.href);
        port.send({ type: 'hello', contentId: contentId(), url: location.href });
      },
      async () => { await chrome.runtime.sendMessage({ target: 'background', type: 'ensureOffscreen' }); },
    );
    // This page's diagnostics live in the offscreen document's buffer; the tag tells one load from the next.
    installLogSink((line) => port.send({ type: 'log', line }), Math.random().toString(36).slice(2, 6));

    const video = new VideoBinding(
      {
        play: (v) => engine.onLocalPlay(v),
        pause: (v) => engine.onLocalPause(v),
        seeking: (v) => engine.onLocalSeeking(v),
        waiting: (v) => engine.onLocalWaiting(v),
        playing: () => engine.onLocalPlaying(),
        ended: (v) => engine.onLocalEnded(v),
      },
      (v, isReattach) => {
        log('page', isReattach ? 'video re-attached' : 'video attached', `readyState=${v.readyState}`, `paused=${v.paused}`);
        if (isReattach) { engine.onVideoAttached(); ducker.reapply(); }
        sidebar.ensureMounted();
      },
      adapter.findVideo,
      cfg.sabotage === 'reattach',
    );
    const engine = new SyncEngine(
      video,
      (out) => {
        // Only the tab that is on the room's episode may drive the room; another HBO tab
        // (or one that wandered to a different episode) must not broadcast its playback.
        const roomContent = snapshot?.room?.contentId ?? null;
        if (roomContent !== null && roomContent !== contentId()) return;
        port.send(out.stalled ? { type: 'stalled' } : { type: 'playback', paused: out.paused, positionMs: out.positionMs });
      },
      cfg.sabotage,
      (line) => log('sync', line),
    );
    const ducker = new Ducker(() => video.get());
    const upNext = new UpNextSuppressor(adapter.upNext);
    const sidebar = new PartySidebar(port, adapter.findVideo);

    function onOffscreenMessage(m: OffscreenToPlayer) {
      switch (m.type) {
        case 'snapshot': {
          const prev = snapshot;
          snapshot = m.snapshot;
          engine.isLeader = m.snapshot.isLeader;
          engine.offsetMs = m.snapshot.offsetMs;
          if (m.snapshot.room && m.snapshot.room.contentId === contentId()) {
            // First sight of room state on this page (fresh load or late join): adopt it.
            if (!prev?.room || prev.room.updatedAt !== m.snapshot.room.updatedAt) engine.applyRemote(m.snapshot.room, m.snapshot.offsetMs);
          }
          if (!m.snapshot.room) engine.room = null;
          upNext.set(!!m.snapshot.room && !m.snapshot.isLeader);
          const room = m.snapshot.room;
          sidebar.update({
            inRoom: !!room, participants: participantsFrom(m.snapshot, { selfFirst: true }),
            connection: m.snapshot.socket === 'connected' ? 'connected' : 'reconnecting',
            offEpisode: room?.contentId && room.watchUrl && room.contentId !== contentId() ? { watchUrl: room.watchUrl } : null,
          });
          return;
        }
        case 'playback':
          if (snapshot?.room && snapshot.room.contentId !== contentId()) return; // not on the room's content
          engine.applyRemote({ paused: m.paused, positionMs: m.positionMs, updatedAt: m.serverTime }, m.offsetMs);
          return;
        case 'navigate':
          if (m.contentId !== contentId() && m.watchUrl && m.originPeerId !== snapshot?.yourPeerId) {
            log('page', 'following navigate to', m.watchUrl);
            location.assign(m.watchUrl);
          }
          return;
        case 'duck':
          ducker.set(m.ducked);
          return;
        case 'loopback:signal':
        case 'loopback:tracks':
          sidebar.onMessage(m);
          return;
        case 'test:diag':
          diagWaiters.get(m.id)?.(m.diag);
          diagWaiters.delete(m.id);
          return;
      }
    }

    const diagWaiters = new Map<number, (d: Diag) => void>();
    let diagSeq = 0;
    const getDiag = () => new Promise<Diag>((resolve, reject) => {
      const id = ++diagSeq;
      diagWaiters.set(id, resolve);
      port.send({ type: 'test:getDiag', id });
      setTimeout(() => { if (diagWaiters.delete(id)) reject(new Error('diag timeout')); }, 5000);
    });

    if (__GAJ_TEST__ && isHarnessHost(location.hostname)) {
      installTestBridge({
        ping: () => 'pong',
        getState: () => {
          const v = video.get();
          return { positionMs: v ? v.currentTime * 1000 : null, paused: v ? v.paused : null, contentId: contentId(), atUnixMs: Date.now(), serverNowMs: engine.serverNow(), playbackRate: v?.playbackRate ?? null, generation: v?.dataset.generation ?? null };
        },
        forceDrift: (ms: number) => engine.forceDrift(ms),
        getCounters: () => ({ ...engine.counters, reattaches: video.reattaches, socketReconnects: snapshot?.socketReconnects ?? 0, portReconnects: port.reconnects }),
        getPeerStats: async () => (await getDiag()).peerStats,
        getRemoteAudio: async () => (await getDiag()).remoteAudio,
        getRemoteVideo: async () => (await getDiag()).remoteVideo,
        getVolume: () => video.get()?.volume ?? null,
        getSnapshot: () => snapshot,
        getDiag,
        createRoom: (code: string, name = 'peer') => port.send({ type: 'test:createRoom', code, name }),
        joinRoom: (code: string, name = 'peer') => port.send({ type: 'test:joinRoom', code, name }),
        leaveRoom: () => port.send({ type: 'test:leaveRoom' }),
        setCamera: (on: boolean) => port.send({ type: 'test:setCamera', on }),
        setMic: (on: boolean) => port.send({ type: 'test:setMic', on }),
        navigate: (cid: string) => port.send({ type: 'navigateRequest', contentId: cid, url: `${location.origin}/watch/${cid}` }),
        resetAudioGaps: () => port.send({ type: 'test:resetAudioGaps' }),
        dropSocket: () => port.send({ type: 'test:dropSocket' }),
      });
    }

    video.start();
    engine.start();
    sidebar.start();
    await port.open();

    // If the extension is reloaded or updated, this copy is orphaned: chrome.runtime.id
    // goes away and every API call throws. Stand down rather than keep correcting the
    // video against stale room state while a fresh copy takes over.
    const watchdog = setInterval(() => {
      if (chrome.runtime?.id) return;
      clearInterval(watchdog);
      engine.stop();
      video.stop();
      upNext.stop();
      sidebar.stop();
      port.close();
    }, 1000);
  },
});
