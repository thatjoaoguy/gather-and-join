/**
 * Remote peer media inside the offscreen document: audio playback (so the call
 * survives page navigation), plus the diagnostics the test hook reads —
 * per-peer peak frequency bin and a sampled video pixel.
 */
import type { PeerId } from '@gaj/shared';

type Remote = {
  stream: MediaStream;
  audioEl: HTMLAudioElement;
  videoEl: HTMLVideoElement;
  analyser: AnalyserNode | null;
  freq: Float32Array<ArrayBuffer> | null;
  peakHz: number;
  level: number;
  lastAudibleAt: number;
  /** Longest gap between audible samples since the last reset (ms). */
  maxGapMs: number;
  speaking: boolean;
  lastLoudAt: number;
};

export type RemoteAudioDiag = { peakHz: number; level: number; lastAudibleAt: number; maxGapMs: number };
/** dBFS at the peak bin above which a peer counts as audible. */
const AUDIBLE_DB = -60;
const SAMPLE_MS = 50;
/** Speaking: louder than this at the peak bin, held for SPEAK_HOLD_MS after the last loud sample. */
export const SPEAK_DB = -45;
export const SPEAK_HOLD_MS = 400;

export class RemoteMedia {
  private ctx: AudioContext | null = null;
  private remotes = new Map<PeerId, Remote>();
  private canvas = document.createElement('canvas');

  constructor(private readonly onSpeaking: (peerId: PeerId, speaking: boolean) => void = () => {}) {
    this.canvas.width = 8; this.canvas.height = 8;
    setInterval(() => this.sampleAudio(), SAMPLE_MS);
  }

  private sampleAudio() {
    const now = Date.now();
    for (const [id, r] of this.remotes) {
      if (!r.analyser || !r.freq || !this.ctx) continue;
      r.analyser.getFloatFrequencyData(r.freq);
      let best = 1, bestVal = -Infinity; // skip DC bin
      for (let i = 1; i < r.freq.length; i++) if (r.freq[i]! > bestVal) { bestVal = r.freq[i]!; best = i; }
      r.peakHz = (best * this.ctx.sampleRate) / r.analyser.fftSize;
      r.level = bestVal;
      if (bestVal > AUDIBLE_DB) {
        if (r.lastAudibleAt) r.maxGapMs = Math.max(r.maxGapMs, now - r.lastAudibleAt);
        r.lastAudibleAt = now;
      }
      if (bestVal > SPEAK_DB) r.lastLoudAt = now;
      const speaking = now - r.lastLoudAt < SPEAK_HOLD_MS;
      if (speaking !== r.speaking) { r.speaking = speaking; this.onSpeaking(id, speaking); }
    }
  }

  /** Test seam: restart gap tracking for every peer. */
  resetAudioGaps() { for (const r of this.remotes.values()) { r.maxGapMs = 0; r.lastAudibleAt = 0; } }

  attach(peerId: PeerId, stream: MediaStream) {
    let r = this.remotes.get(peerId);
    if (r && r.stream === stream) return;
    if (r) this.detach(peerId);
    // Chrome quirk: WebRTC audio must be sunk to a media element for WebAudio to see it.
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.srcObject = stream;
    void audioEl.play().catch(() => {});
    const videoEl = document.createElement('video');
    videoEl.muted = true; videoEl.autoplay = true; videoEl.playsInline = true;
    videoEl.srcObject = stream;
    videoEl.style.cssText = 'width:64px;height:48px;position:absolute;opacity:0.01;pointer-events:none;';
    document.body.appendChild(videoEl);
    void videoEl.play().catch(() => {});
    r = { stream, audioEl, videoEl, analyser: null, freq: null, peakHz: 0, level: -Infinity, lastAudibleAt: 0, maxGapMs: 0, speaking: false, lastLoudAt: 0 };
    this.remotes.set(peerId, r);
    this.wireAnalyser(peerId, r);
    stream.addEventListener('addtrack', () => this.wireAnalyser(peerId, r!));
  }

  private wireAnalyser(_peerId: PeerId, r: Remote) {
    if (r.analyser || r.stream.getAudioTracks().length === 0) return;
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(new MediaStream(r.stream.getAudioTracks()));
    r.analyser = this.ctx.createAnalyser();
    r.analyser.fftSize = 4096;
    r.analyser.smoothingTimeConstant = 0.2;
    src.connect(r.analyser);
    r.freq = new Float32Array(r.analyser.frequencyBinCount);
  }

  detach(peerId: PeerId) {
    const r = this.remotes.get(peerId);
    if (!r) return;
    r.audioEl.srcObject = null;
    r.videoEl.srcObject = null;
    r.videoEl.remove();
    this.remotes.delete(peerId);
    if (r.speaking) this.onSpeaking(peerId, false);
  }

  /** Latest per-peer audio sample (50ms cadence) plus the audible-gap tracker. */
  audioPeaks(): Record<PeerId, RemoteAudioDiag> {
    const out: Record<PeerId, RemoteAudioDiag> = {};
    for (const [id, r] of this.remotes) out[id] = { peakHz: r.peakHz, level: r.level, lastAudibleAt: r.lastAudibleAt, maxGapMs: r.maxGapMs };
    return out;
  }

  /** Centre pixel of each peer's video, or null when no frame has arrived. */
  videoPixels(): Record<PeerId, [number, number, number] | null> {
    const out: Record<PeerId, [number, number, number] | null> = {};
    const g = this.canvas.getContext('2d', { willReadFrequently: true })!;
    for (const [id, r] of this.remotes) {
      if (r.videoEl.readyState < 2 || r.videoEl.videoWidth === 0) { out[id] = null; continue; }
      try {
        g.drawImage(r.videoEl, 0, 0, 8, 8);
        const d = g.getImageData(4, 4, 1, 1).data;
        out[id] = [d[0]!, d[1]!, d[2]!];
      } catch { out[id] = null; }
    }
    return out;
  }
}
