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

export type SidebarModel = { inRoom: boolean; participants: Participant[]; connection: SidebarConnection; offEpisode?: OffEpisode };
type Sender = { send(m: PlayerToOffscreen): void };

const REMOUNT_POLL_MS = 500;

export class PartySidebar {
  private readonly loopback: LoopbackReceiver;
  private readonly view: SidebarView;
  private model: SidebarModel = { inRoom: false, participants: [], connection: 'connected' };
  private poll: ReturnType<typeof setInterval> | null = null;
  private readonly onFullscreen = () => { if (this.model.inRoom) this.view.mount(); };

  constructor(
    private readonly port: Sender,
    findVideo: (root: ParentNode) => HTMLVideoElement | null,
    private readonly doc: Document = document,
  ) {
    this.loopback = new LoopbackReceiver((payload) => port.send({ type: 'loopback:signal', payload }), () => this.render());
    this.view = new SidebarView(new PageLayout(findVideo, doc), (url) => doc.location.assign(url), doc);
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
    this.view.update(
      this.model.participants.map(({ peerId, name, self, speaking, micOn, lost }) => ({ peerId, name, self, speaking, muted: micOn === false, lost })),
      (id) => this.loopback.streamFor(id),
      this.model.connection,
      this.model.offEpisode ?? null,
    );
  }
}
