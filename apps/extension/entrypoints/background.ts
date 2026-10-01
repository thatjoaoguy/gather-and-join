/**
 * Service worker. Holds no state that matters — Chrome kills it at will.
 * Responsibilities: keep the offscreen document alive, detect navigations in
 * player tabs (both history-state and full loads), relay them, open pages on
 * behalf of contexts that cannot (offscreen, popup), paint the toolbar badge,
 * which is the one chrome.action the offscreen document cannot reach, and keep
 * the player script registered for the services the user has granted.
 */
import { defineBackground } from 'wxt/utils/define-background';
import { parseContentId, PLAYER_HOSTS, PROVIDERS, SERVICES } from '@gj/shared';
import { applyBadge, badgeStateFrom, type BadgeState, type IconDeps } from '../lib/badge';
import { readTestConfig, type Snapshot, type ToBackground, type ToOffscreen } from '../lib/messages';
import { log } from '../lib/log';
import { adapterForDocument, playerUrlOf } from '../lib/providers';
import { PlayerAccess } from '../lib/player-access';

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

// Chrome asks for the action icon at 16 (1x) and 32 (2x); the larger sizes in the
// manifest are for other surfaces and are never dotted.
const ICON_SIZES = [16, 32] as const;
const ICON_PATHS: Record<string, string> = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };

// The worker keeps nothing across a restart, so these are re-fetched on the next
// wake; a failed fetch drops out of the cache rather than sticking as a rejection.
const baseIcons = new Map<number, Promise<ImageBitmap>>();
function baseIcon(size: number): Promise<ImageBitmap> {
  let pending = baseIcons.get(size);
  if (!pending) {
    pending = fetch(chrome.runtime.getURL(`icon/${size}.png`))
      .then((r) => r.blob())
      .then(createImageBitmap)
      .catch((e) => { baseIcons.delete(size); throw e; });
    baseIcons.set(size, pending);
  }
  return pending;
}

const icons: IconDeps = {
  sizes: ICON_SIZES,
  paths: ICON_PATHS,
  surface: (size) => new OffscreenCanvas(size, size),
  base: baseIcon,
};

/** The dot is cosmetic: a failure is logged and dropped, never thrown at a caller. */
async function showBadge(state: BadgeState): Promise<void> {
  try { await applyBadge(chrome.action, state, { name: chrome.runtime.getManifest().name, icons }); }
  catch (e) { log('background', 'badge failed', state, String(e)); }
}

/**
 * This worker remembers nothing, so the badge is re-derived from the offscreen
 * document rather than restored. Chrome keeps the badge across a worker restart
 * on its own; this is for the starts where it does not — a new browser session,
 * an install, an update.
 */
async function refreshBadge(): Promise<void> {
  const snapshot = (await toOffscreen({ target: 'offscreen', type: 'getSnapshot' })) as Snapshot | undefined;
  await showBadge(snapshot ? badgeStateFrom(snapshot) : 'idle');
}

/** The active tab's player URL: the tab's own, or its embedded player's frame. */
async function activePlayerUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url || tab.id === undefined) return null;
  const frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) ?? [];
  return playerUrlOf(tab.url, frames.map((f) => f.url));
}

// The harness is a required host of test builds, so it goes through the same registration as a granted service.
const access = new PlayerAccess(__GJ_TEST__ ? PROVIDERS : SERVICES, {
  permissions: chrome.permissions,
  scripting: chrome.scripting,
  tabIds: async () => (await chrome.tabs.query({})).flatMap((t) => (t.id === undefined ? [] : [t.id])),
  frames: async (tabId) => (await chrome.webNavigation.getAllFrames({ tabId })) ?? [],
  sendToFrame: (tabId, frameId, msg) => chrome.tabs.sendMessage(tabId, msg, { frameId }),
  log,
});

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
    if (!msg || msg.target !== 'background') return;
    switch (msg.type) {
      case 'ensureOffscreen':
        ensureOffscreen().then(() => sendResponse(true), (e) => sendResponse({ error: String(e) }));
        return true;
      case 'openPage':
        chrome.tabs.create({ url: msg.url }).then(() => sendResponse(true));
        return true;
      // A player frame cannot navigate the page it sits in; this moves the sender's whole tab.
      case 'navigateTab':
        if (sender.tab?.id === undefined) { sendResponse(false); return; }
        chrome.tabs.update(sender.tab.id, { url: msg.url }).then(() => sendResponse(true), () => sendResponse(false));
        return true;
      case 'grantMic':
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html?grant=1') }).then(() => sendResponse(true));
        return true;
      case 'grantCamera':
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html?grant=camera') }).then(() => sendResponse(true));
        return true;
      case 'getActivePlayerUrl':
        activePlayerUrl().then(sendResponse, () => sendResponse(null));
        return true;
      case 'badge':
        void showBadge(msg.state);
        sendResponse(true);
        return;
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
    // An embedded player's frame is the player; any other frame is not.
    if (d.frameId !== 0 && !adapterForDocument(d.url, false)) return;
    // The filter is static, but a service the user has not granted has no player script to follow it.
    if (!(await access.grantedFor(d.url))) return;
    log('background', 'navigation', d.url);
    if (__GJ_TEST__ && (await readTestConfig()).sabotage === 'offscreen') {
      // Sabotage: pretend long-lived state lived in a context that dies on navigation.
      // Only episode *transitions* count (the tab was already on a player page), so the
      // first load of a page does not race the room join.
      const key = `gjLastUrl:${d.tabId}`;
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
  // refreshBadge goes through the offscreen document, so these two still bring it up.
  chrome.runtime.onStartup.addListener(() => { void refreshBadge(); void access.sync(); });
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    void refreshBadge();
    // Chrome does not re-inject content scripts into tabs that were open before an
    // install/update/reload; the copy in those pages is orphaned. Inject fresh ones.
    void access.sync().then(async () => access.inject(await access.granted()));
    // A fresh profile has no microphone, no camera and no server address, so the popup
    // has nothing to offer but setup. Test builds skip it: the harness loads unpacked,
    // and an extra tab per peer is noise.
    if (!__GJ_TEST__ && reason === 'install') void chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  });

  // A grant from the popup, the setup page or chrome://extensions. The page that asked is already loaded, so it gets a script now.
  chrome.permissions.onAdded.addListener(({ origins }) => {
    void access.sync().then(() => access.inject(access.providersIn(origins)));
  });
  // A revocation: new pages stop getting the script, and the copies already running stand down.
  chrome.permissions.onRemoved.addListener(({ origins }) => {
    void access.sync().then(() => access.standDown(access.providersIn(origins)));
  });
});
