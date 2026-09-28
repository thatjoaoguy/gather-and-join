/**
 * Composes the sidebar: participants in, tiles out. Owns nothing the room
 * cares about; every input arrives from the offscreen document's snapshot and
 * the loopback, so a fresh content script rebuilds it from scratch.
 */
import type { OffscreenToPlayer, PlayerToOffscreen } from '../messages';
import type { Participant } from '../participants';
import { LoopbackReceiver } from './loopback-receiver';
import { PageLayout } from './page-layout';
import { SidebarView, type OffEpisode, type SidebarConnection } from './sidebar-view';
import { EpisodeStartControl, type CopiesInput } from './episode-start';
import type { SettingsModel } from './settings-panel';

export type SidebarModel = { inRoom: boolean; participants: Participant[]; connection: SidebarConnection; offEpisode?: OffEpisode; copies?: CopiesInput | null; settings?: SettingsModel | null };
type Sender = { send(m: PlayerToOffscreen): void };
/** What the page cannot do itself: the camera grant opens in a tab of its own. */
export type SidebarOpeners = { allowCamera(): void };

const REMOUNT_POLL_MS = 500;

export class PartySidebar {
  private readonly loopback: LoopbackReceiver;
  private readonly view: SidebarView;
  private readonly episodeStart: EpisodeStartControl;
  private model: SidebarModel = { inRoom: false, participants: [], connection: 'connected' };
  private poll: ReturnType<typeof setInterval> | null = null;
  private readonly onFullscreen = () => { if (this.model.inRoom) this.view.mount(); };

  constructor(
    private readonly port: Sender,
    findAnchor: (root: ParentNode) => HTMLElement | null,
    openers: SidebarOpeners,
    private readonly doc: Document = document,
  ) {
    this.loopback = new LoopbackReceiver((payload) => port.send({ type: 'loopback:signal', payload }), () => this.render());
    this.episodeStart = new EpisodeStartControl((contentId, start) => port.send({ type: 'episodeStart', contentId, start }));
    this.view = new SidebarView(new PageLayout(findAnchor, doc), {
      goToEpisode: (url) => doc.location.assign(url),
      enterStart: (ms) => { this.episodeStart.enter(ms); this.render(); },
      alignStart: () => this.episodeStart.align(),
      clearStart: () => this.episodeStart.clear(),
      setMic: (on) => port.send({ type: 'setMic', on }),
      setCamera: (on) => port.send({ type: 'setCamera', on }),
      copyCode: (code) => doc.defaultView!.navigator.clipboard.writeText(code).then(() => true, () => false),
      ...openers,
    }, doc);
  }

  /** Players re-render their container on fullscreen and other transitions and drop foreign children with it; poll and put the sidebar back. */
  start() {
    this.doc.addEventListener('fullscreenchange', this.onFullscreen);
    this.poll ??= setInterval(() => this.ensureMounted(), REMOUNT_POLL_MS);
  }

  stop() {
    this.doc.removeEventListener('fullscreenchange', this.onFullscreen);
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.loopback.close();
    this.view.unmount();
  }

  update(model: SidebarModel) {
    this.model = model;
    const want = model.inRoom;
    if (want && !this.loopback.isOpen) this.loopback.open();
    if (!want && this.loopback.isOpen) this.loopback.close();
    if (want) this.view.mount(); else this.view.unmount();
    this.port.send({ type: 'loopback:want', want });
    this.render();
  }

  onMessage(m: Extract<OffscreenToPlayer, { type: 'loopback:signal' | 'loopback:tracks' }>) {
    if (m.type === 'loopback:signal') this.loopback.handleSignal(m.payload as never);
    else this.loopback.setTracks(m.tracks);
  }

  ensureMounted() {
    if (this.model.inRoom) this.view.ensureMounted();
  }

  private render() {
    if (!this.model.inRoom) return;
    this.view.update({
      tiles: this.model.participants.map(({ peerId, name, self, speaking, micOn, lost }) => ({ peerId, name, self, speaking, muted: micOn === false, lost })),
      streamFor: (id) => this.loopback.streamFor(id),
      connection: this.model.connection,
      offEpisode: this.model.offEpisode ?? null,
      copies: this.episodeStart.model(this.model.copies ?? null),
      settings: this.model.settings ?? null,
    });
  }
}
