/**
 * The field for how much of the longer copy to skip, shared by the rail notice and
 * the settings panel. Takes "7:04", "7:04.25" or plain seconds; a value is used
 * when it is committed (Enter, or leaving the field), never while being typed.
 */
import { clockExact, parseClock } from './episode-start';

let seq = 0;

export class StartField {
  readonly el: HTMLDivElement;
  private readonly input: HTMLInputElement;

  constructor(doc: Document, private readonly onCommit: (ms: number) => void) {
    const id = `gj-start-${++seq}`;
    this.el = doc.createElement('div');
    this.el.className = 'start-field';
    this.el.innerHTML = `<label for="${id}">Longer copy skips</label><div class="control"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="m:ss.cc" aria-describedby="${id}-hint"></div><span class="hint" id="${id}-hint">Minutes and seconds, e.g. 7:04.25</span>`;
    this.input = this.el.querySelector('input')!;
    this.input.addEventListener('change', () => this.commit());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.commit(); });
  }

  /** A button beside the input, e.g. Clear. */
  addAction(button: HTMLButtonElement) {
    this.el.querySelector('.control')!.append(button);
  }

  /** Show the room's value, unless someone is typing over it. */
  show(ms: number) {
    if (this.input.matches(':focus')) return;
    this.input.value = clockExact(ms);
    this.input.removeAttribute('aria-invalid');
  }

  /** Use what is in the field. Null, and marked invalid, when it is not a time. */
  commit(): number | null {
    const ms = parseClock(this.input.value);
    if (ms === null) { this.input.setAttribute('aria-invalid', 'true'); return null; }
    this.input.removeAttribute('aria-invalid');
    this.onCommit(ms);
    return ms;
  }
}

export const START_FIELD_STYLE = `
  .start-field { display: grid; gap: 4px; }
  .start-field label { font-size: 11px; font-weight: 700; color: var(--text); }
  .start-field .control { display: flex; align-items: center; gap: 6px; }
  .start-field .control button { flex: none; }
  .start-field input { box-sizing: border-box; flex: 1; min-width: 0; width: 100%; min-height: 32px; padding: 5px 10px; border: 1px solid #51445e; border-radius: 10px; background: #1c1922; color: var(--text); font: 700 14px/1.2 Quicksand, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
  .start-field input:focus-visible { outline: 2px solid var(--purple); outline-offset: 1px; }
  .start-field input[aria-invalid="true"] { border: 2px solid var(--red); }
  .start-field .hint { font-size: 10px; color: var(--muted); }
`;

/**
 * Players bind keyboard shortcuts on the document (space plays, arrows seek, some
 * jump on digits). Keys pressed inside the sidebar are ours: typing a time or
 * pressing space on a button must not reach the player.
 */
export function keepKeysFromPlayer(el: HTMLElement) {
  for (const type of ['keydown', 'keyup', 'keypress'] as const) el.addEventListener(type, (e) => e.stopPropagation());
}
