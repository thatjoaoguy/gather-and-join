/**
 * Streaming providers, URL level only.
 *
 * A provider is the identity of a player site: the hosts it runs on, how a page
 * URL maps to a content id, and how a content id maps back to a watch URL. This
 * file is imported by the server, so it must stay DOM-free. Everything that
 * needs the page (finding the <video>, the up-next panel) lives in the
 * extension's PlayerAdapter for the same provider id.
 *
 * Adding a provider: add an entry to PROVIDERS here and a PlayerAdapter in
 * `apps/extension/lib/providers/`. Manifest matches and host permissions are
 * derived from PROVIDERS at build time, so the extension still needs a rebuild.
 */
export type ContentProvider = {
  readonly id: string;
  /** Exact hostnames of the player. Drives webNavigation filters and adapter lookup. */
  readonly hosts: readonly string[];
  /** Manifest match patterns for the content script and host permissions. */
  readonly matches: readonly string[];
  /** Content id for one of this provider's page URLs, or null if it is not a watch page. */
  parseContentId(url: URL): string | null;
  /** Whether this provider owns a content id. Routes `watchUrl`. */
  ownsContentId(contentId: string): boolean;
  /** Canonical watch URL for one of this provider's content ids, or null if it cannot be derived. */
  watchUrl(contentId: string): string | null;
};

/**
 * HBO Max (inspected 2026-09-16): the app is `play.hbomax.com`, watch pages are
 * `/video/watch/<uuid>` with no URN anywhere, so the content id is `hbomax:<uuid>`.
 */
const HBOMAX_ORIGIN = 'https://play.hbomax.com';
const HBOMAX_WATCH_RE = /\/video\/watch\/([0-9a-f-]{36})/i;
const HBOMAX_PREFIX = 'hbomax:';

export const hbomax: ContentProvider = {
  id: 'hbomax',
  hosts: ['play.hbomax.com'],
  matches: ['https://play.hbomax.com/*'],
  parseContentId(url) {
    const m = decodeURIComponent(url.pathname).match(HBOMAX_WATCH_RE);
    return m ? `${HBOMAX_PREFIX}${m[1]!.toLowerCase()}` : null;
  },
  ownsContentId: (id) => id.startsWith(HBOMAX_PREFIX),
  watchUrl: (id) => `${HBOMAX_ORIGIN}/video/watch/${id.slice(HBOMAX_PREFIX.length)}`,
};

/**
 * The test harness's fake player, served on localhost. It embeds an HBO-shaped
 * URN in its path. Its watch URL depends on the port it was started on, so the
 * server's WATCH_URL_TEMPLATE supplies it instead of this provider.
 */
const CONTENT_URN_RE = /urn:hbo:[a-z]+:[A-Za-z0-9_-]+/;

export const harness: ContentProvider = {
  id: 'harness',
  hosts: ['localhost', '127.0.0.1'],
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  parseContentId(url) {
    const m = decodeURIComponent(url.pathname).match(CONTENT_URN_RE);
    return m ? m[0] : null;
  },
  ownsContentId: (id) => id.startsWith('urn:hbo:'),
  watchUrl: () => null,
};

/** Every provider, in lookup order. */
export const PROVIDERS: readonly ContentProvider[] = [hbomax, harness];

/** All manifest match patterns, for the content script and host permissions. */
export const PLAYER_MATCHES: readonly string[] = PROVIDERS.flatMap((p) => p.matches);

/** All player hostnames, for webNavigation filters. */
export const PLAYER_HOSTS: readonly string[] = PROVIDERS.flatMap((p) => p.hosts);

export function providerForHost(hostname: string): ContentProvider | null {
  return PROVIDERS.find((p) => p.hosts.includes(hostname)) ?? null;
}

export function providerForContentId(contentId: string): ContentProvider | null {
  return PROVIDERS.find((p) => p.ownsContentId(contentId)) ?? null;
}
