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
import { clock, type CopiesModel } from './episode-start';
import { SettingsPanel, SETTINGS_STYLE, type SettingsActions, type SettingsModel } from './settings-panel';
import { StartField, START_FIELD_STYLE, keepKeysFromPlayer } from './start-field';

export type TileModel = { peerId: PeerId; name: string; self: boolean; speaking: boolean; muted: boolean; lost: boolean };
export type SidebarConnection = 'connected' | 'reconnecting';
/** The room is on another episode; the sidebar offers the way there. */
export type OffEpisode = { watchUrl: string } | null;
export type SidebarActions = SettingsActions & { goToEpisode(watchUrl: string): void };
export type SidebarViewModel = {
  tiles: TileModel[];
  streamFor: (peerId: PeerId) => MediaStream | null;
  connection: SidebarConnection;
  offEpisode: OffEpisode;
  copies: CopiesModel | null;
  settings: SettingsModel | null;
};

const STYLE = `
  :host { all: initial; --bg:#101014; --surface:#1c1922; --raised:#272130; --line:#44394e; --text:#f4f0fa; --muted:#c3bacf; --purple:#b9a0ff; --red:#fa8294; --warning:#f2c66d; --warning-bg:#2b2419; --success:#86d6b0; --r-tile:14px; --rail:${SIDEBAR_WIDTH}px;
    position: fixed; top: 0; bottom: 0; right: 0; width: ${SIDEBAR_WIDTH}px; background: #100e15; box-shadow: inset 1px 0 0 #302837; z-index: 2147483647; font: 500 12px/1.5 Quicksand, system-ui, sans-serif; color: var(--text); }
  :host(.overlay) { position: absolute; left: auto; right: 0; }
  .column { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; padding: 50px 16px 16px; box-sizing: border-box; overflow-y: auto; }
  .column.has-status { justify-content: flex-start; }
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
  .column.has-notice, .column.has-copies { justify-content: flex-start; }
  .column.has-notice .rail-notice.episode, .column.has-copies .rail-notice.copies { display: flex; }
  .rail-notice.copies { background: var(--warning-bg); border-color: var(--warning); }
  .rail-notice.copies strong { color: var(--warning); }

  .self-controls { position: absolute; right: 8px; bottom: 8px; z-index: 2; display: flex; gap: 6px; opacity: 0; transition: opacity 120ms ease; }
  .tile.self:hover .self-controls, .tile.self:focus-within .self-controls { opacity: 1; }
  .self-controls button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid #51445e; border-radius: 50%; background: #08080cd9; color: var(--text); cursor: pointer; }
  .self-controls button[aria-pressed="false"] { color: var(--red); border-color: var(--red); }
  .self-controls button:focus-visible { outline: 2px solid var(--purple); outline-offset: 1px; }
  .self-controls svg { width: 14px; height: 14px; }
  @media (prefers-reduced-motion: reduce) { .tile, .self-controls { transition: none; } }
${START_FIELD_STYLE}
${SETTINGS_STYLE}`;


export class SidebarView {
  private host: HTMLDivElement | null = null;
  private column: HTMLDivElement | null = null;
  private status: HTMLParagraphElement | null = null;
  private notice: HTMLDivElement | null = null;
  private copiesNotice: HTMLDivElement | null = null;
  private copiesField: StartField | null = null;
  private offEpisode: OffEpisode = null;
  private copies: CopiesModel | null = null;
  private settings: SettingsModel | null = null;
  private settingsPanel: SettingsPanel | null = null;
  private tiles: TileModel[] = [];
  private connection: SidebarConnection = 'connected';
  private streamFor: (peerId: PeerId) => MediaStream | null = () => null;

  constructor(private readonly layout: PageLayout, private readonly actions: SidebarActions, private readonly doc: Document = document) {}

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
      this.notice.className = 'rail-notice episode';
      this.notice.setAttribute('role', 'status');
      this.notice.innerHTML = `<strong>${ICONS.info}Watching another episode</strong><span>Your room is on a different episode.</span><button type="button">Go to episode</button>`;
      this.notice.querySelector('button')!.onclick = () => { if (this.offEpisode) this.actions.goToEpisode(this.offEpisode.watchUrl); };
      this.copiesNotice = this.doc.createElement('div');
      this.copiesNotice.className = 'rail-notice copies';
      this.copiesNotice.setAttribute('role', 'group');
      this.copiesNotice.setAttribute('aria-label', 'Copies differ');
      this.copiesNotice.innerHTML = `<strong>${ICONS.warn}<span class="title"></span></strong><span class="body"></span>`;
      const field = this.copiesField = new StartField(this.doc, (ms) => this.actions.enterStart(ms));
      const align = this.doc.createElement('button');
      align.type = 'button';
      align.className = 'align';
      align.textContent = 'Align';
      align.onclick = () => { if (field.commit() !== null) this.actions.alignStart(); };
      this.copiesNotice.append(field.el, align);
      keepKeysFromPlayer(this.column);
      shadow.append(style, this.column);
      // Chrome before 114 has no popover: an unsupported panel would render permanently open, so leave it out.
      if ('popover' in HTMLElement.prototype) {
        this.settingsPanel = new SettingsPanel(this.doc, this.actions);
        shadow.append(this.settingsPanel.gear, this.settingsPanel.panel);
        keepKeysFromPlayer(this.settingsPanel.gear);
        keepKeysFromPlayer(this.settingsPanel.panel);
      }
    }
    const fs = this.doc.fullscreenElement as HTMLElement | null;
    const parent = fs ?? this.doc.body;
    this.host.classList.toggle('overlay', !!fs);
    if (parent && this.host.parentElement !== parent) parent.appendChild(this.host);
    // Leave the previous mode first: an element still tagged for fullscreen would be skipped by page mode.
    this.layout.shrinkFullscreenChildren(fs, this.host);
    this.layout.shrinkPage(!fs);
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

  update(m: SidebarViewModel) {
    this.tiles = m.tiles;
    this.streamFor = m.streamFor;
    this.connection = m.connection;
    this.offEpisode = m.offEpisode;
    this.copies = m.copies;
    this.settings = m.settings;
    this.render();
  }

  /** Your own tile's mic and camera buttons, shown on hover or keyboard focus. */
  private selfControls(): HTMLDivElement {
    const box = this.doc.createElement('div');
    box.className = 'self-controls';
    box.innerHTML = '<button type="button" class="mic" aria-label="Microphone"></button><button type="button" class="cam" aria-label="Camera"></button>';
    box.querySelector<HTMLButtonElement>('.mic')!.onclick = () => { if (this.settings) this.actions.setMic(!this.settings.micOn); };
    box.querySelector<HTMLButtonElement>('.cam')!.onclick = () => { if (this.settings) this.actions.setCamera(!this.settings.camOn); };
    return box;
  }

  private renderSelfControls(tile: HTMLElement) {
    const box = tile.querySelector<HTMLElement>('.self-controls');
    if (!box) return;
    box.hidden = !this.settings;
    if (!this.settings) return;
    const { micOn, camOn } = this.settings;
    const mic = box.querySelector<HTMLButtonElement>('.mic')!, cam = box.querySelector<HTMLButtonElement>('.cam')!;
    mic.setAttribute('aria-pressed', String(micOn));
    mic.title = micOn ? 'Mute' : 'Unmute';
    mic.innerHTML = micOn ? ICONS.mic : ICONS.micOff;
    cam.setAttribute('aria-pressed', String(camOn));
    cam.title = camOn ? 'Turn camera off' : 'Turn camera on';
    cam.innerHTML = camOn ? ICONS.cam : ICONS.camOff;
  }

  private renderCopies(el: HTMLDivElement, c: CopiesModel | null) {
    if (!c || c.set) return;
    el.querySelector('.title')!.textContent = `Copies differ by ${clock(c.longMs - c.shortMs)}`;
    el.querySelector('.body')!.textContent = `One copy runs ${clock(c.longMs)}, another ${clock(c.shortMs)}. The longer one skips its extra start, filled in with the difference.`;
    this.copiesField?.show(c.startMs);
  }

  /** Reconcile the column with the tile list: keyed by peer id, order preserved, stale tiles removed. */
  private render() {
    const column = this.column;
    if (!column || !this.status || !this.notice || !this.copiesNotice) return;
    column.classList.toggle('has-notice', !!this.offEpisode);
    // The rail asks until the start is set; adjusting it afterwards lives in the settings panel.
    column.classList.toggle('has-copies', !!this.copies && !this.copies.set);
    this.renderCopies(this.copiesNotice, this.copies);
    this.settingsPanel?.update(this.settings, this.copies);
    column.insertBefore(this.copiesNotice, column.firstChild);
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
        if (p.self) tile.append(this.selfControls());
      }
      if (p.self) this.renderSelfControls(tile);
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
