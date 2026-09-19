/**
 * Isolated-world half of the in-page test hook. The MAIN-world script
 * (entrypoints/testhook.content.ts) posts `{__gj: 'req'}` messages on the
 * window; we answer with `{__gj: 'res'}`. Only ever installed on harness hosts
 * in a test build.
 */
export type HookMethods = Record<string, (...args: any[]) => unknown | Promise<unknown>>;

export function installTestBridge(methods: HookMethods) {
  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__gj !== 'req' || typeof d.id !== 'number') return;
    const fn = methods[d.method as string];
    let reply: { __gj: 'res'; id: number; ok: boolean; result?: unknown; error?: string };
    if (!fn) reply = { __gj: 'res', id: d.id, ok: false, error: `no method ${d.method}` };
    else {
      try { reply = { __gj: 'res', id: d.id, ok: true, result: await fn(...(d.args ?? [])) }; }
      catch (e) { reply = { __gj: 'res', id: d.id, ok: false, error: String((e as Error)?.message ?? e) }; }
    }
    window.postMessage(reply, '*');
  });
  // Tell the MAIN-world half we exist (it may have loaded first).
  window.postMessage({ __gj: 'ready' }, '*');
}
