/**
 * Local mic/camera and the speech detector that drives ducking. Lives in the
 * offscreen document. Mic permission cannot be prompted here — it is granted
 * once from the options page and inherited by the extension origin.
 */
export const DUCK_RMS_THRESHOLD = 0.02;
export const DUCK_SILENCE_MS = 1000;
export const DUCK_POLL_MS = 50;

import { log } from './log';
import { kvGet } from './kv';

export class LocalMedia {
  micStream: MediaStream | null = null;
  camStream: MediaStream | null = null;
  micPermission: 'unknown' | 'granted' | 'denied' = 'unknown';
  camPermission: 'unknown' | 'granted' | 'denied' = 'unknown';
  level = 0;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private speaking = false;
  private lastVoice = 0;
  private poll: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly onSpeaking: (speaking: boolean) => void) {}

  async ensureMic(): Promise<MediaStreamTrack | null> {
    if (this.micStream) return this.micStream.getAudioTracks()[0] ?? null;
    if (__GAJ_TEST__) {
      // Test seam: a real microphone takes a while to come up; the fake one is instant.
      const delay = Number((await kvGet('local', ['testMicDelayMs'])).testMicDelayMs ?? 0);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micPermission = 'granted';
    } catch (e) {
      this.micPermission = (e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unknown';
      log('offscreen', 'mic unavailable', String(e));
      return null;
    }
    this.startDetector(this.micStream);
    return this.micStream.getAudioTracks()[0] ?? null;
  }

  async ensureCamera(): Promise<MediaStreamTrack | null> {
    if (this.camStream) return this.camStream.getVideoTracks()[0] ?? null;
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 } } });
      this.camPermission = 'granted';
      log('offscreen', 'camera acquired', this.camStream.getVideoTracks()[0]?.getSettings());
    } catch (e) {
      this.camPermission = (e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unknown';
      log('offscreen', 'camera unavailable', String(e));
      return null;
    }
    return this.camStream.getVideoTracks()[0] ?? null;
  }

  stopCamera() {
    this.camStream?.getTracks().forEach((t) => t.stop());
    this.camStream = null;
  }

  /** Release the microphone (and its speech detector). The next ensureMic re-acquires it. */
  stopMic() {
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
    this.analyser?.disconnect();
    this.analyser = null;
    this.buf = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.level = 0;
    if (this.speaking) { this.speaking = false; this.onSpeaking(false); }
  }

  private startDetector(stream: MediaStream) {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.poll = setInterval(() => this.sample(), DUCK_POLL_MS);
  }

  private sample() {
    if (!this.analyser || !this.buf) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i]! * this.buf[i]!;
    this.level = Math.sqrt(sum / this.buf.length);
    const now = Date.now();
    const micEnabled = this.micStream?.getAudioTracks()[0]?.enabled ?? false;
    if (micEnabled && this.level > DUCK_RMS_THRESHOLD) {
      this.lastVoice = now;
      if (!this.speaking) { this.speaking = true; this.onSpeaking(true); }
    } else if (this.speaking && now - this.lastVoice > DUCK_SILENCE_MS) {
      this.speaking = false;
      this.onSpeaking(false);
    }
  }

  dispose() {
    this.stopMic();
    this.stopCamera();
  }
}
