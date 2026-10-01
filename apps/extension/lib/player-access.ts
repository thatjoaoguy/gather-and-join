/**
 * Which streaming services the user has let the extension onto, and the player
 * script kept in step with that.
 *
 * Every service is an optional host permission: nothing is granted at install,
 * and a grant or a revocation can come from the popup, the setup page or
 * chrome://extensions at any time. The player script is therefore registered at
 * runtime for exactly the granted services, because a host named in a manifest
 * `content_scripts` entry is an install-time permission.
 *
 * Runs in the service worker, which remembers nothing: every method re-reads
 * Chrome's own state, so any wake can call any of them.
 */
import { providerForHost, type ContentProvider } from '@gj/shared';
import { adapterForDocument } from './providers';
import type { ToPlayer } from './messages';

/** WXT builds the `player` content script entrypoint to this file. */
export const PLAYER_SCRIPT = { id: 'player', file: 'content-scripts/player.js' } as const;

type Frame = { frameId: number; url: string };
type ScriptSpec = { id: string; js: string[]; matches: string[]; allFrames: boolean; runAt: 'document_idle' };

export type AccessDeps = {
  permissions: { contains(p: { origins: string[] }): Promise<boolean> };
  scripting: {
    getRegisteredContentScripts(filter: { ids: string[] }): Promise<Array<{ id: string; matches?: string[] }>>;
    registerContentScripts(scripts: ScriptSpec[]): Promise<void>;
    updateContentScripts(scripts: ScriptSpec[]): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
    executeScript(injection: { target: { tabId: number; frameIds: number[] }; files: string[] }): Promise<unknown>;
  };
  tabIds(): Promise<number[]>;
  frames(tabId: number): Promise<Frame[]>;
  sendToFrame(tabId: number, frameId: number, msg: ToPlayer): Promise<unknown>;
  log(...parts: unknown[]): void;
};

/** Whether `url` is one a manifest match pattern such as `https://drive.google.com/file/*` covers. Ports never count, as in Chrome. */
export function matchesPattern(url: string, pattern: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const m = pattern.match(/^([a-z*]+):\/\/([^/]+)(\/.*)$/);
  if (!m) return false;
  const [, scheme, host, path] = m as unknown as [string, string, string, string];
  if (scheme !== '*' && `${scheme}:` !== u.protocol) return false;
  if (host !== u.hostname && !(host.startsWith('*.') && u.hostname.endsWith(host.slice(1)))) return false;
  const glob = new RegExp(`^${path.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return glob.test(u.pathname + u.search);
}

export class PlayerAccess {
  /** Registration is read-then-write; two at once would both try to register the same id. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly providers: readonly ContentProvider[], private readonly deps: AccessDeps) {}

  isGranted(p: ContentProvider): Promise<boolean> {
    return this.deps.permissions.contains({ origins: [...p.matches] });
  }

  async granted(): Promise<ContentProvider[]> {
    const held = await Promise.all(this.providers.map((p) => this.isGranted(p)));
    return this.providers.filter((_, i) => held[i]);
  }

  /** Whether the page at `url` is on a service the user has granted. */
  async grantedFor(url: string): Promise<boolean> {
    const p = this.providerOf(url);
    return !!p && (await this.isGranted(p));
  }

  /** The services a `chrome.permissions` event names, by host, whatever form Chrome reports the pattern in. */
  providersIn(origins: readonly string[] | undefined): ContentProvider[] {
    const hosts = (origins ?? []).map((o) => o.match(/^[a-z*]+:\/\/([^/]+)\//)?.[1]);
    return this.providers.filter((p) => p.hosts.some((h) => hosts.includes(h)));
  }

  /** Register the player script for exactly the granted services. */
  sync(): Promise<void> {
    const run = this.queue.then(() => this.syncNow());
    this.queue = run.catch(() => {});
    return run;
  }

  private async syncNow() {
    const { scripting, log } = this.deps;
    const matches = (await this.granted()).flatMap((p) => p.matches);
    const [current] = await scripting.getRegisteredContentScripts({ ids: [PLAYER_SCRIPT.id] });
    if (!matches.length) {
      if (current) { await scripting.unregisterContentScripts({ ids: [PLAYER_SCRIPT.id] }); log('background', 'player script unregistered'); }
      return;
    }
    // allFrames: an embedded player (Wix Video) is only ever a frame; adapterForDocument keeps every other frame out.
    const script: ScriptSpec = { id: PLAYER_SCRIPT.id, js: [PLAYER_SCRIPT.file], matches, allFrames: true, runAt: 'document_idle' };
    if (!current) await scripting.registerContentScripts([script]);
    else if (!sameSet(current.matches ?? [], matches)) await scripting.updateContentScripts([script]);
    else return;
    log('background', 'player script registered for', matches.join(' '));
  }

  /**
   * A fresh player script in the open pages of `providers`. Registration only
   * reaches pages loaded after it, and an install or update orphans the copy
   * already in a page, so both a grant and an update come through here.
   */
  async inject(providers: readonly ContentProvider[]): Promise<void> {
    await this.eachPlayerFrame(providers, async (tabId, frames) => {
      try {
        await this.deps.scripting.executeScript({ target: { tabId, frameIds: frames.map((f) => f.frameId) }, files: [PLAYER_SCRIPT.file] });
        this.deps.log('background', 'injected into tab', tabId, frames[0]!.url);
      } catch (e) { this.deps.log('background', 'inject failed', tabId, String(e)); }
    });
  }

  /** Tell the player script in the open pages of `providers` to stop: the user took the permission back. */
  async standDown(providers: readonly ContentProvider[]): Promise<void> {
    await this.eachPlayerFrame(providers, async (tabId, frames) => {
      for (const f of frames) await this.deps.sendToFrame(tabId, f.frameId, { target: 'player', type: 'standDown' }).catch(() => {});
    });
  }

  private providerOf(url: string): ContentProvider | null {
    let hostname: string;
    try { hostname = new URL(url).hostname; } catch { return null; }
    const p = providerForHost(hostname);
    return p && this.providers.includes(p) ? p : null;
  }

  /** The frames of each open tab that the player script runs in, or would, for `providers`. */
  private async eachPlayerFrame(providers: readonly ContentProvider[], fn: (tabId: number, frames: Frame[]) => Promise<void>) {
    if (!providers.length) return;
    for (const tabId of await this.deps.tabIds()) {
      const frames = (await this.deps.frames(tabId).catch(() => [])).filter((f) => {
        const p = this.providerOf(f.url);
        if (!p || !providers.includes(p) || !p.matches.some((m) => matchesPattern(f.url, m))) return false;
        // A player site's other frames are not the player; an embedded one's video frame is.
        return f.frameId === 0 || adapterForDocument(f.url, false) !== null;
      });
      if (frames.length) await fn(tabId, frames);
    }
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
