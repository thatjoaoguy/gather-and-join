/**
 * The room settings panel, opened from the gear at the top of the rail: the room
 * code, your mic and camera, where the episode starts in a longer copy, and the
 * server. A popover, so the browser handles opening, Escape, a click outside and
 * returning focus, and it sits in the top layer above the player in fullscreen too.
 *
 * Built once and updated in place: re-rendering the markup would drop focus from
 * the button someone just pressed.
 */
import { ICONS } from '../ui/icons';
import { clock, type CopiesModel } from './episode-start';
import type { SettingsModel } from './settings-model';
import { StartField } from './start-field';

export type { SettingsModel };
export const SETTINGS_ID = 'gj-settings';

export type SettingsActions = {
  setMic(on: boolean): void;
  setCamera(on: boolean): void;
  allowCamera(): void;
  copyCode(code: string): Promise<boolean>;
  enterStart(ms: number): void;
  alignStart(): void;
  clearStart(): void;
};

export const SETTINGS_STYLE = `
  .gear { position: absolute; top: 10px; right: 10px; z-index: 2; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--muted); cursor: pointer; }
  .gear:hover, .gear[aria-expanded="true"] { color: var(--text); background: var(--raised); }
  .gear svg, .settings .x svg { width: 16px; height: 16px; }
  .settings { position: fixed; inset: 0 0 0 auto; width: var(--rail); height: 100%; max-height: none; margin: 0; padding: 16px; box-sizing: border-box; overflow-y: auto; border: 0; box-shadow: inset 1px 0 0 #302837; background: #100e15; color: var(--text); font: 500 12px/1.5 Quicksand, system-ui, sans-serif; }
  .settings header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .settings h2 { margin: 0; font-size: 14px; font-weight: 700; }
  .settings h3 { margin: 18px 0 8px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .settings button { min-height: 30px; border: 1px solid var(--line); border-radius: 15px; padding: 5px 12px; background: transparent; color: var(--text); font: inherit; font-weight: 700; cursor: pointer; }
  .settings button.primary { background: var(--purple); border-color: var(--purple); color: #1c112e; }
  .settings .x { display: grid; place-items: center; width: 30px; padding: 0; color: var(--muted); }
  .settings .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .settings .code { font-size: 20px; font-weight: 700; letter-spacing: .15em; }
  .settings .meta, .settings .note { margin: 6px 0 0; font-size: 11px; color: var(--muted); }
  .settings .note.ok { color: var(--success); }
  .settings .chip { border: 1px solid var(--line); border-radius: 10px; padding: 1px 7px; font-size: 10px; color: var(--muted); }
  .settings .chip.host { border-color: var(--purple); color: var(--purple); }
  .settings .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .settings .toggles button { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 6px; }
  .settings .toggles svg { width: 14px; height: 14px; flex: none; }
  .settings .toggles [aria-pressed="true"] { background: var(--purple); border-color: var(--purple); color: #1c112e; }
  .settings .toggles [aria-pressed="false"] { background: #1c1922; color: var(--muted); }
  .settings .problem { margin-top: 8px; padding: 8px 10px; border: 1px solid var(--warning); border-radius: 12px; background: var(--warning-bg); font-size: 11px; }
  .settings .problem button { margin-top: 6px; }
  .settings .episode { display: flex; flex-direction: column; gap: 8px; }
  .settings .episode p { margin: 0; font-size: 11px; }
  .settings .episode .service { font-size: 10px; font-weight: 700; color: var(--muted); }
  .settings .episode .title { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
  .settings .episode a { color: var(--purple); font-weight: 700; overflow-wrap: anywhere; }
  .settings .copies { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px; border: 1px solid var(--warning); border-radius: 12px; background: var(--warning-bg); }
  .settings .copies[hidden] { display: none; }
  .settings .copies strong { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--warning); }
  .settings .copies strong svg { width: 14px; height: 14px; flex: none; }
  .settings .copies:not(.set) button.clear, .settings .copies.set button.align { display: none; }
  .settings .server { display: flex; align-items: center; gap: 7px; font-size: 11px; }
  .settings .server > svg { width: 14px; height: 14px; flex: none; color: var(--muted); }
  .settings .server .address { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .settings .server .address.hidden { filter: blur(4px); }
  .settings .server .address.hidden:hover, .settings .server .address.hidden:focus { filter: none; }
  .settings .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--muted); }
  .settings .dot.ok { background: var(--success); } .settings .dot.busy { background: var(--warning); } .settings .dot.err { background: var(--red); }
`;

export class SettingsPanel {
  readonly gear: HTMLButtonElement;
  readonly panel: HTMLDivElement;
  private model: SettingsModel | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly field: StartField;

  constructor(doc: Document, private readonly actions: SettingsActions) {
    this.gear = doc.createElement('button');
    this.gear.type = 'button';
    this.gear.className = 'gear';
    this.gear.setAttribute('popovertarget', SETTINGS_ID);
    this.gear.setAttribute('aria-label', 'Room settings');
    this.gear.title = 'Room settings';
    this.gear.innerHTML = ICONS.settings;

    this.panel = doc.createElement('div');
    this.panel.id = SETTINGS_ID;
    this.panel.className = 'settings';
    this.panel.setAttribute('popover', '');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-labelledby', `${SETTINGS_ID}-title`);
    this.panel.innerHTML = `
      <header><h2 id="${SETTINGS_ID}-title">Room settings</h2><button type="button" class="x" popovertarget="${SETTINGS_ID}" popovertargetaction="hide" aria-label="Close settings" autofocus>${ICONS.close}</button></header>
      <h3>Room</h3>
      <div class="row"><span class="code"></span><button type="button" class="copy">Copy</button></div>
      <p class="meta"><span class="chip role"></span> <span class="connection"></span></p>
      <p class="note copied" role="status"></p>
      <h3>Episode</h3>
      <div class="episode">
        <p class="service"></p>
        <p class="title"></p>
        <p class="elsewhere">You’re not on the room’s episode. <a class="go"></a></p>
        <p class="none">The room hasn’t picked an episode yet.</p>
        <div class="copies" role="group" aria-label="Copies differ">
          <strong>${ICONS.warn}<span class="differ-by"></span></strong>
          <p class="about"></p>
          <button type="button" class="primary align">Align</button>
        </div>
      </div>
      <h3>You</h3>
      <div class="toggles"><button type="button" class="mic"></button><button type="button" class="cam"></button></div>
      <div class="problem" role="alert" hidden><span class="problem-text"></span><button type="button" class="primary allow">Allow camera</button></div>
      <h3>Server</h3>
      <div class="server">${ICONS.server}<span class="dot"></span><span class="address" tabindex="0"></span></div>`;

    const q = <T extends HTMLElement>(sel: string) => this.panel.querySelector<T>(sel)!;
    q('.copy').onclick = async () => {
      if (!this.model) return;
      const ok = await this.actions.copyCode(this.model.code);
      const note = q('.copied');
      note.textContent = ok ? 'Room code copied.' : 'Clipboard unavailable. Select the code above.';
      note.classList.toggle('ok', ok);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => { note.textContent = ''; }, 2500);
    };
    q('.mic').onclick = () => { if (this.model) this.actions.setMic(!this.model.micOn); };
    q('.cam').onclick = () => { if (this.model) this.actions.setCamera(!this.model.camOn); };
    q('.allow').onclick = () => this.actions.allowCamera();
    this.field = new StartField(doc, (ms) => this.actions.enterStart(ms));
    q('.copies').insertBefore(this.field.el, q('.align'));
    q('.align').onclick = () => { if (this.field.commit() !== null) this.actions.alignStart(); };
    const clear = doc.createElement('button');
    clear.type = 'button';
    clear.className = 'clear';
    clear.textContent = 'Clear';
    clear.onclick = () => this.actions.clearStart();
    this.field.addAction(clear);
  }

  update(model: SettingsModel | null, copies: CopiesModel | null) {
    this.model = model;
    this.gear.hidden = !model;
    if (!model) { if (this.panel.matches(':popover-open')) this.panel.hidePopover(); return; }
    const q = <T extends HTMLElement>(sel: string) => this.panel.querySelector<T>(sel)!;
    q('.code').textContent = model.code;
    const role = q('.role');
    role.textContent = model.host ? 'Host' : 'Guest';
    role.classList.toggle('host', model.host);
    q('.connection').textContent = model.connection;

    const mic = q('.mic'), cam = q('.cam');
    mic.setAttribute('aria-pressed', String(model.micOn));
    mic.innerHTML = `${model.micOn ? ICONS.mic : ICONS.micOff}${model.micOn ? 'Mic on' : 'Mic off'}`;
    cam.setAttribute('aria-pressed', String(model.camOn));
    cam.innerHTML = `${model.camOn ? ICONS.cam : ICONS.camOff}${model.camOn ? 'Camera on' : 'Camera off'}`;
    const problem = q('.problem');
    problem.hidden = !model.camProblem;
    q('.problem-text').textContent = model.camProblem === 'missing' ? 'No camera found. Plug one in, or check another app isn’t using it.' : 'Camera access is blocked.';
    q('.allow').hidden = model.camProblem !== 'blocked';

    const ep = model.episode;
    q('.service').hidden = !ep?.service;
    q('.service').textContent = ep?.service ?? '';
    q('.title').hidden = !ep?.title;
    q('.title').textContent = ep?.title ?? '';
    q('.elsewhere').hidden = !ep || ep.here;
    const go = q<HTMLAnchorElement>('.go');
    go.hidden = !ep?.watchUrl;
    if (ep?.watchUrl) { go.href = ep.watchUrl; go.textContent = 'Go to episode'; } else go.removeAttribute('href');
    q('.none').hidden = !!ep;
    // Only when the copies differ: with equal lengths there is nothing to skip.
    const box = q('.copies');
    box.hidden = !ep?.here || !copies;
    box.classList.toggle('set', !!copies?.set);
    if (copies) {
      q('.differ-by').textContent = `Copies differ by ${clock(copies.longMs - copies.shortMs)}`;
      q('.about').textContent = `One copy runs ${clock(copies.longMs)}, another ${clock(copies.shortMs)}.`;
      this.field.show(copies.startMs);
    }

    const address = q('.address');
    address.textContent = model.server.host;
    address.classList.toggle('hidden', model.server.hidden);
    address.title = model.server.hidden ? 'Hidden · hover to reveal' : '';
    q('.dot').className = `dot ${model.server.tone}`;
    q('.dot').setAttribute('aria-label', model.server.word);
    q('.dot').setAttribute('role', 'img');
  }
}
