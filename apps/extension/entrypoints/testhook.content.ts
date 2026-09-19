/**
 * MAIN-world half of the in-page test hook: defines `window.__gj` for
 * Playwright and forwards each call to the isolated-world content script over
 * postMessage. Only built when GJ_TEST=1 (see wxt.config.ts) and only matched
 * on localhost, so it cannot ship.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';

const METHODS = [
  'getState', 'forceDrift', 'getCounters', 'getPeerStats', 'getRemoteAudio', 'getRemoteVideo', 'getVolume',
  'getSnapshot', 'getDiag', 'createRoom', 'joinRoom', 'leaveRoom', 'setCamera', 'setMic', 'navigate', 'ping', 'resetAudioGaps', 'dropSocket',
] as const;

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    if (!__GJ_TEST__) return;
    let seq = 0;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.__gj !== 'res') return;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.ok) p.resolve(d.result); else p.reject(new Error(d.error));
    });
    const call = (method: string, ...args: unknown[]) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      window.postMessage({ __gj: 'req', id, method, args }, '*');
      setTimeout(() => { if (pending.delete(id)) reject(new Error(`__gj.${method} timed out`)); }, 10_000);
    });
    const hook: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
    for (const m of METHODS) hook[m] = (...a: unknown[]) => call(m, ...a);
    (window as any).__gj = hook;
  },
});
