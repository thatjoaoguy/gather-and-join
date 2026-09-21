/**
 * The participant HUD: a full-height column on the right, in a shadow root so
 * host CSS cannot reach it. One tile per participant, live video where a
 * stream exists, otherwise the initial and the name. In fullscreen it overlays
 * the right edge of the fullscreen element instead of pushing the page.
 *
 * Styling follows design system v1.0 (docs/design-system): tokens are repeated
 * here because a shadow root does not inherit the page's custom properties,
 * and Quicksand is declared in the host document because @font-face inside a
 * shadow root is ignored.
 */
import type { PeerId } from '@gj/shared';
import { ICONS } from '../ui/icons';
import { SIDEBAR_WIDTH, type PageLayout } from './page-layout';
import { ensureQuicksand } from '../ui/fonts';

export type TileModel = { peerId: PeerId; name: string; self: boolean; speaking: boolean; muted: boolean; lost: boolean };
export type SidebarConnection = 'connected' | 'reconnecting';
/** The room is on another episode; the sidebar offers the way there. */
export type OffEpisode = { watchUrl: string } | null;

/**
 * Every :host declaration is !important, which is load-bearing rather than
 * shouting. A shadow root protects its contents from page CSS but not its host
 * element, and a document rule matching the host beats :host for normal
 * declarations — a reset listing `div` takes the background, the font and
 * `all: initial` with it. Important declarations cascade the other way round.
 * :host(.overlay) is important for the same reason, against the `position` above.
 */
const STYLE = `
  :host { all: initial !important; --bg:#101014; --surface:#1c1922; --raised:#272130; --line:#44394e; --text:#f4f0fa; --muted:#c3bacf; --purple:#b9a0ff; --red:#fa8294; --warning:#f2c66d; --warning-bg:#2b2419; --r-tile:14px;
    position: fixed !important; top: 0 !important; bottom: 0 !important; right: 0 !important; width: ${SIDEBAR_WIDTH}px !important; background: #100e15 !important; box-shadow: inset 1px 0 0 #302837 !important; z-index: 2147483647 !important; font: 500 12px/1.5 Quicksand, system-ui, sans-serif !important; color: var(--text) !important; }
  :host(.overlay) { position: absolute !important; left: auto !important; right: 0 !important; }
  .column { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; padding: 16px; box-sizing: border-box; overflow-y: auto; }
  .column.has-status { justify-content: flex-start; padding-top: 16px; }
  .tile { position: relative; width: ${SIDEBAR_WIDTH - 32}px; aspect-ratio: 4/3; box-sizing: border-box; border: 1px solid #51445e; border-radius: var(--r-tile); background: #211b2a; overflow: hidden; flex: none; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; transition: opacity 120ms ease, border-color 120ms ease; }
  .tile::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 1; box-shadow: inset 0 0 0 2px transparent; transition: box-shadow 120ms ease; }
  .tile.speaking::after { box-shadow: inset 0 0 0 2px var(--purple); }
  .tile.speaking { border-color: var(--purple); }
  .tile.lost { opacity: .55; }
  .tile video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .tile.self video { transform: scaleX(-1); }
  .tile:not(.has-video) video { display: none; }
  .placeholder { display: flex; align-items: center; }
  .tile.has-video .placeholder { display: none; }
  .avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #302539; color: var(--purple); font-size: 19px; font-weight: 700; }
  .tile.red .avatar { color: var(--red); }
  .name { font-size: 12px; font-weight: 700; color: var(--text); }
  .tile.has-video .name { position: absolute; left: 10px; bottom: 8px; padding: 2px 8px; border-radius: 10px; background: #08080cbf; font-weight: 500; }
  .badge { position: absolute; top: 8px; left: 8px; z-index: 2; display: none; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--warning-bg); border: 1px solid var(--warning); color: var(--warning); }
  .badge svg { width: 13px; height: 13px; }
  .tile.muted .badge.muted, .tile.lost .badge.lost { display: grid; }
  .tile.lost .badge.muted { display: none; }
  .rail-status { display: none; margin: auto 0 0; align-items: center; gap: 7px; width: 100%; box-sizing: border-box; font-size: 11px; font-weight: 700; color: var(--warning); background: var(--warning-bg); border: 1px solid var(--warning); border-radius: 12px; padding: 6px 10px; }
  .rail-status svg { width: 14px; height: 14px; flex: none; }
  .column.has-status .rail-status { display: flex; }
  .rail-notice { display: none; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box; margin: 0 0 4px; font-size: 11px; color: var(--text); background: #192536; border: 1px solid #94c5ff; border-radius: 12px; padding: 10px; }
  .rail-notice strong { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94c5ff; }
  .rail-notice strong svg { width: 14px; height: 14px; flex: none; }
  .rail-notice button { min-height: 30px; border: 0; border-radius: 15px; padding: 6px 12px; background: var(--purple); color: #1c112e; font: inherit; font-weight: 700; cursor: pointer; }
  .column.has-notice { justify-content: flex-start; }
  .column.has-notice .rail-notice { display: flex; }
  @media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
`;


export class SidebarView {
  private host: HTMLDivElement | null = null;
  private column: HTMLDivElement | null = null;
  private status: HTMLParagraphElement | null = null;
  private notice: HTMLDivElement | null = null;
  private offEpisode: OffEpisode = null;
  private tiles: TileModel[] = [];
  private connection: SidebarConnection = 'connected';
  private streamFor: (peerId: PeerId) => MediaStream | null = () => null;

  constructor(private readonly layout: PageLayout, private readonly onGoToEpisode: (watchUrl: string) => void, private readonly doc: Document = document) {}

  get isMounted() { return !!this.host?.isConnected; }

  /** (Re)parent the sidebar: into the fullscreen element when there is one, else body. Idempotent. */
  mount() {
    if (!this.host) {
      ensureQuicksand(this.doc);
      this.host = this.doc.createElement('div');
      this.host.id = 'gj-tiles';
      const shadow = this.host.attachShadow({ mode: 'open' });
      const style = this.doc.createElement('style');
      style.textContent = STYLE;
      this.column = this.doc.createElement('div');
      this.column.className = 'column';
      this.status = this.doc.createElement('p');
      this.status.className = 'rail-status';
      this.status.setAttribute('role', 'status');
      this.status.innerHTML = `${ICONS.warn}<span>Reconnecting…</span>`;
      this.notice = this.doc.createElement('div');
      this.notice.className = 'rail-notice';
      this.notice.setAttribute('role', 'status');
      this.notice.innerHTML = `<strong>${ICONS.info}Watching another episode</strong><span>Your room is on a different episode.</span><button type="button">Go to episode</button>`;
      this.notice.querySelector('button')!.onclick = () => { if (this.offEpisode) this.onGoToEpisode(this.offEpisode.watchUrl); };
      shadow.append(style, this.column);
    }
    const fs = this.doc.fullscreenElement as HTMLElement | null;
    const parent = fs ?? this.doc.body;
    this.host.classList.toggle('overlay', !!fs);
    if (parent && this.host.parentElement !== parent) parent.appendChild(this.host);
    // Leave the old mode before entering the new one: both can want the same element,
    // and one still tagged by the mode being left is skipped by the one being entered.
    if (fs) { this.layout.shrinkPage(false); this.layout.shrinkFullscreenChildren(fs, this.host); }
    else { this.layout.shrinkFullscreenChildren(null, null); this.layout.shrinkPage(true); }
    this.render();
  }

  /** Cheap check, called often: re-attach if the host was removed or the fullscreen element changed. */
  ensureMounted() {
    if (!this.host) return;
    const fs = this.doc.fullscreenElement as HTMLElement | null;
    const parent = fs ?? this.doc.body;
    if (!this.host.isConnected || this.host.parentElement !== parent) { this.mount(); return; }
    if (fs) this.layout.shrinkFullscreenChildren(fs, this.host); // re-rendered children lose their width
    else this.layout.refreshPage(); // the player layer may have appeared or been re-rendered since we mounted
  }

  unmount() {
    this.host?.remove();
    this.layout.restoreAll();
  }

  update(tiles: TileModel[], streamFor: (peerId: PeerId) => MediaStream | null, connection: SidebarConnection = 'connected', offEpisode: OffEpisode = null) {
    this.tiles = tiles;
    this.streamFor = streamFor;
    this.connection = connection;
    this.offEpisode = offEpisode;
    this.render();
  }

  /** Reconcile the column with the tile list: keyed by peer id, order preserved, stale tiles removed. */
  private render() {
    const column = this.column;
    if (!column || !this.status || !this.notice) return;
    column.classList.toggle('has-notice', !!this.offEpisode);
    column.insertBefore(this.notice, column.firstChild); // always first
    const existing = new Map<string, HTMLElement>();
    column.querySelectorAll<HTMLElement>('.tile').forEach((t) => existing.set(t.dataset.peerId!, t));
    for (const p of this.tiles) {
      let tile = existing.get(p.peerId);
      if (!tile) {
        tile = this.doc.createElement('div');
        tile.className = 'tile';
        tile.dataset.peerId = p.peerId;
        tile.innerHTML = `<span class="badge muted" title="Muted">${ICONS.micOff}</span><span class="badge lost" title="Reconnecting">${ICONS.warn}</span><div class="placeholder"><span class="avatar" aria-hidden="true"></span></div><video autoplay muted playsinline></video><span class="name"></span>`;
      }
      existing.delete(p.peerId);
      tile.classList.toggle('self', p.self);
      tile.classList.toggle('speaking', p.speaking && !p.lost);
      tile.classList.toggle('muted', p.muted);
      tile.classList.toggle('lost', p.lost);
      tile.classList.toggle('red', !p.self && hashHue(p.peerId));
      tile.querySelector('.avatar')!.textContent = initial(p.name);
      tile.querySelector('.name')!.textContent = p.name;
      const video = tile.querySelector('video')!;
      const stream = this.streamFor(p.peerId);
      if (video.srcObject !== stream) video.srcObject = stream;
      tile.classList.toggle('has-video', !!stream);
      column.appendChild(tile); // appendChild keeps order
    }
    for (const stale of existing.values()) stale.remove();
    column.classList.toggle('has-status', this.connection !== 'connected');
    column.appendChild(this.status); // always last
  }
}

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
/** Alternate the avatar accent by peer id so neighbours differ, deterministically. */
const hashHue = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return (h & 1) === 1; };
