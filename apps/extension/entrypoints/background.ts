/**
 * Service worker. Holds no state that matters — Chrome kills it at will.
 * Responsibilities: keep the offscreen document alive, detect navigations in
 * player tabs (both history-state and full loads) and relay them, and open
 * pages on behalf of contexts that cannot (offscreen, popup).
 */
import { defineBackground } from 'wxt/utils/define-background';
import { parseContentId, PLAYER_HOSTS } from '@gaj/shared';
import { readTestConfig, type ToBackground, type ToOffscreen } from '../lib/messages';
import { log } from '../lib/log';

const OFFSCREEN_URL = 'offscreen.html';
let creating: Promise<void> | null = null;

async function hasOffscreen(): Promise<boolean> {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return ctxs.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.WEB_RTC, chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Keeps the room WebSocket, WebRTC voice/video mesh and microphone alive across page navigations.',
    })
    .catch((e) => { if (!String(e).includes('single offscreen')) throw e; })
    .finally(() => { creating = null; });
  await creating;
}

async function toOffscreen(msg: ToOffscreen): Promise<unknown> {
  await ensureOffscreen();
  try { return await chrome.runtime.sendMessage(msg); } catch { return undefined; }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: ToBackground, _sender, sendResponse) => {
    if (!msg || msg.target !== 'background') return;
    switch (msg.type) {
      case 'ensureOffscreen':
        ensureOffscreen().then(() => sendResponse(true), (e) => sendResponse({ error: String(e) }));
        return true;
      case 'openPage':
        chrome.tabs.create({ url: msg.url }).then(() => sendResponse(true));
        return true;
      case 'grantMic':
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html?grant=1') }).then(() => sendResponse(true));
        return true;
      case 'grantCamera':
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html?grant=camera') }).then(() => sendResponse(true));
        return true;
      case 'getActiveTabUrl':
        chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => sendResponse(tab?.url ?? null));
        return true;
      // The offscreen document has no chrome.storage; it reads and writes through here.
      case 'kv:get':
        chrome.storage[msg.area].get(msg.keys).then(sendResponse, () => sendResponse({}));
        return true;
      case 'kv:set':
        chrome.storage[msg.area].set(msg.data).then(() => sendResponse(true), () => sendResponse(false));
        return true;
    }
  });

  // §6.2: episode transitions may be client-side routed, real loads, or both.
  const filter: chrome.webNavigation.WebNavigationEventFilter = {
    url: PLAYER_HOSTS.map((hostEquals) => ({ hostEquals })),
  };
  const onNav = async (d: { tabId: number; url: string; frameId: number }) => {
    if (d.frameId !== 0) return;
    log('background', 'navigation', d.url);
    if (__GAJ_TEST__ && (await readTestConfig()).sabotage === 'offscreen') {
      // Sabotage: pretend long-lived state lived in a context that dies on navigation.
      // Only episode *transitions* count (the tab was already on a player page), so the
      // first load of a page does not race the room join.
      const key = `gajLastUrl:${d.tabId}`;
      const prev = (await chrome.storage.session.get(key))[key] as string | undefined;
      await chrome.storage.session.set({ [key]: d.url });
      if (prev && (await hasOffscreen())) await chrome.offscreen.closeDocument();
    }
    await toOffscreen({ target: 'offscreen', type: 'navigation', tabId: d.tabId, url: d.url, contentId: parseContentId(d.url) });
  };
  chrome.webNavigation.onHistoryStateUpdated.addListener(onNav, filter);
  chrome.webNavigation.onCompleted.addListener(onNav, filter);

  // A port from a content script or popup is aimed at the offscreen document;
  // make sure it exists so the connection has somewhere to land.
  chrome.runtime.onConnect.addListener(() => { void ensureOffscreen(); });
  chrome.runtime.onStartup.addListener(() => { void ensureOffscreen(); });
  chrome.runtime.onInstalled.addListener(() => {
    void ensureOffscreen();
    // Chrome does not re-inject content scripts into tabs that were open before an
    // install/update/reload; the copy in those pages is orphaned. Inject fresh ones.
    void reinjectPlayerScripts();
  });

  async function reinjectPlayerScripts() {
    const manifest = chrome.runtime.getManifest();
    const cs = manifest.content_scripts?.find((c) => c.js?.some((f) => f.includes('player')));
    if (!cs?.js) return;
    const tabs = await chrome.tabs.query({ url: cs.matches });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: cs.js }); log('background', 'reinjected into tab', tab.id, tab.url ?? ''); }
      catch (e) { log('background', 'reinject failed', tab.id, String(e)); }
    }
  }
});
