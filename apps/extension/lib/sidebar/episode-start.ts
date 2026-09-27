/**
 * The "copies differ" notice: when the room's copies of an episode have different
 * lengths, anyone can say how much of the longer one to skip. Before it is set, the
 * field edits a proposal that starts at the length difference — exact when all the
 * extras sit in front. Once set, an edit goes straight to the room.
 */
import { copyMismatch, type EpisodeStart } from '@gj/shared';

export type CopiesInput = { contentId: string; durationsMs: number[]; start: EpisodeStart | null };
export type CopiesModel = { shortMs: number; longMs: number; startMs: number; set: boolean };

export class EpisodeStartControl {
  private input: CopiesInput | null = null;
  private proposal: { contentId: string; startMs: number } | null = null;

  constructor(private readonly send: (contentId: string, start: EpisodeStart | null) => void) {}

  /** What the notice shows, or null when the copies agree. */
  model(input: CopiesInput | null): CopiesModel | null {
    this.input = input;
    if (!input) return null;
    const mismatch = copyMismatch(input.durationsMs);
    if (!mismatch) return null;
    if (input.start) return { ...mismatch, startMs: input.start.startMs, set: true };
    if (this.proposal?.contentId !== input.contentId) this.proposal = { contentId: input.contentId, startMs: mismatch.longMs - mismatch.shortMs };
    return { ...mismatch, startMs: this.proposal.startMs, set: false };
  }

  /** A value typed into the field. */
  enter(ms: number) {
    const m = this.current();
    if (!m) return;
    const startMs = clamp(ms, m.model.longMs);
    if (m.input.start) { if (startMs !== m.input.start.startMs) this.send(m.input.contentId, { durationMs: m.input.start.durationMs, startMs }); }
    else this.proposal = { contentId: m.input.contentId, startMs };
  }

  align() {
    const m = this.current();
    if (m && !m.model.set) this.send(m.input.contentId, { durationMs: m.model.longMs, startMs: m.model.startMs });
  }

  clear() {
    const m = this.current();
    if (m?.model.set) this.send(m.input.contentId, null);
  }

  private current() {
    const input = this.input;
    const model = input && this.model(input);
    return input && model ? { input, model } : null;
  }
}

const clamp = (ms: number, longMs: number) => Math.min(longMs - 1000, Math.max(0, ms));

/** 424_000 → "7:04"; an hour or more → "1:03:04". */
export function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Like `clock`, keeping hundredths when there are any: 424_250 → "7:04.25". A frame is ~40 ms. */
export function clockExact(ms: number): string {
  const cs = Math.round(ms / 10);
  const whole = clock(Math.floor(cs / 100) * 1000);
  const frac = cs % 100;
  return frac ? `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}` : whole;
}

/** "7:04", "7:04.25", "1:03:05" or plain seconds ("424.5") → ms; null for anything else. */
export function parseClock(text: string): number | null {
  const m = /^\s*(?:(?:(\d+):)?(\d{1,2}):)?(\d+(?:[.,]\d{1,3})?)\s*$/.exec(text);
  if (!m) return null;
  const [, h, min, sec] = m;
  const seconds = Number(sec!.replace(',', '.'));
  if (min !== undefined && seconds >= 60) return null;
  if (h !== undefined && Number(min) >= 60) return null;
  return Math.round(((Number(h ?? 0) * 60 + Number(min ?? 0)) * 60 + seconds) * 1000);
}
