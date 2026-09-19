/**
 * chrome.storage access that also works from the offscreen document, which
 * only has `chrome.runtime` — there it proxies through the service worker.
 *
 * That proxy is a message round-trip, and a service worker which stops answering
 * leaves `sendMessage` pending rather than rejecting. Unbounded, that hangs whoever
 * awaited it: the offscreen document reads the room to rejoin (`RoomSession.boot`)
 * and the server address (`RoomSession.join`) through here, so a wedged worker used
 * to mean no rejoin and no join at all, silently. Every proxied call therefore has a
 * deadline and a few retries — a worker being restarted costs a moment, a worker that
 * never comes back costs one failed call.
 */
type Area = 'local' | 'session';

const CALL_TIMEOUT_MS = 2000;
const ATTEMPTS = 3;
const RETRY_BASE_MS = 200;

const direct = () => (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage : null);

export async function kvGet(area: Area, keys: string[] | null): Promise<Record<string, unknown>> {
  const s = direct();
  if (s) return s[area].get(keys);
  const reply = await proxy<Record<string, unknown>>({ target: 'background', type: 'kv:get', area, keys });
  if (reply === undefined) throw new Error(`kv:get ${area} got no answer from the service worker`);
  return reply;
}

export async function kvSet(area: Area, data: Record<string, unknown>): Promise<void> {
  const s = direct();
  if (s) return s[area].set(data);
  const reply = await proxy<boolean>({ target: 'background', type: 'kv:set', area, data });
  if (reply === undefined) throw new Error(`kv:set ${area} got no answer from the service worker`);
  if (!reply) throw new Error(`kv:set ${area} was refused by chrome.storage`);
}

/** The worker's reply, or undefined once the attempts are spent. Never rejects. */
async function proxy<T>(msg: Record<string, unknown>): Promise<T | undefined> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const reply = await within<T>(sendMessage(msg));
    // A dormant worker is started by the message itself, so a miss is worth one more try;
    // `undefined` also covers a listener that declined, which a retry settles either way.
    if (reply !== undefined) return reply;
    if (attempt < ATTEMPTS - 1) await sleep(RETRY_BASE_MS * 2 ** attempt);
  }
  return undefined;
}

function sendMessage(msg: Record<string, unknown>): Promise<unknown> {
  try { return chrome.runtime.sendMessage(msg); } catch (e) { return Promise.reject(e); }
}

function within<T>(p: Promise<unknown>): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), CALL_TIMEOUT_MS);
    p.then(
      (v) => { clearTimeout(t); resolve(v as T | undefined); },
      () => { clearTimeout(t); resolve(undefined); },
    );
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
