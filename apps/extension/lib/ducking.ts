/** Ramp video.volume down while someone is talking and back up after silence. */
export const DUCK_LEVEL = 0.3;
export const DUCK_DOWN_MS = 200;
export const DUCK_UP_MS = 400;

export class Ducker {
  /** The user's own volume, sampled only when we are not touching it — never mid-ramp. */
  private userVolume: number | null = null;
  private ducked = false;
  private ramp: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly getVideo: () => HTMLVideoElement | null) {}

  set(ducked: boolean) {
    if (ducked === this.ducked) return;
    const v = this.getVideo();
    this.ducked = ducked;
    if (!v) return;
    if (ducked) {
      // A duck that starts while the previous restore is still ramping must not
      // treat the half-restored volume as "normal", or each cycle compounds downward.
      if (this.userVolume === null || !this.ramp) this.userVolume = v.volume;
      this.rampTo(Math.min(v.volume, DUCK_LEVEL * this.userVolume), DUCK_DOWN_MS);
    } else {
      this.rampTo(this.userVolume ?? v.volume, DUCK_UP_MS, () => { this.userVolume = null; });
    }
  }

  /** A recreated element starts at the player's default volume; re-apply. */
  reapply() {
    const v = this.getVideo();
    if (v && this.ducked && this.userVolume !== null) v.volume = Math.min(v.volume, DUCK_LEVEL * this.userVolume);
  }

  private rampTo(target: number, ms: number, done?: () => void) {
    if (this.ramp) clearInterval(this.ramp);
    const v0 = this.getVideo();
    if (!v0) return;
    const start = v0.volume;
    const t0 = performance.now();
    this.ramp = setInterval(() => {
      const v = this.getVideo();
      if (!v) { clearInterval(this.ramp!); this.ramp = null; return; }
      const k = Math.min(1, (performance.now() - t0) / ms);
      v.volume = start + (target - start) * k;
      if (k >= 1) { clearInterval(this.ramp!); this.ramp = null; done?.(); }
    }, 16);
  }
}
