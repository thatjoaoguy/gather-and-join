/**
 * chrome.storage access that also works from the offscreen document, which
 * only has `chrome.runtime` — there it proxies through the service worker.
 */
type Area = 'local' | 'session';

const direct = () => (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage : null);

export async function kvGet(area: Area, keys: string[] | null): Promise<Record<string, unknown>> {
  const s = direct();
  if (s) return s[area].get(keys);
  return (await chrome.runtime.sendMessage({ target: 'background', type: 'kv:get', area, keys })) ?? {};
}

export async function kvSet(area: Area, data: Record<string, unknown>): Promise<void> {
  const s = direct();
  if (s) return s[area].set(data);
  await chrome.runtime.sendMessage({ target: 'background', type: 'kv:set', area, data });
}
