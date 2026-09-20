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
 * Most providers share one shape: a page URL carrying an opaque id, a content
 * id of `<providerId>:<thatId>`, and a URL template to get back. Written by
 * hand, that shape restates the prefix three times — building it, testing it in
 * `ownsContentId`, slicing it off in `watchUrl` — and nothing stops those three
 * drifting apart. Deriving the prefix from the provider id once makes them
 * agree by construction.
 *
 * Where the id sits in the URL is the provider's business, not this helper's:
 * HBO Max and Drive read a path, YouTube reads a query parameter.
 *
 * Not every provider fits (the harness's content id *is* the matched URN, with
 * no prefix to add and no derivable watch URL); those stay hand-written.
 */
type PrefixedProviderSpec = {
  readonly id: string;
  readonly hosts: readonly string[];
  readonly matches: readonly string[];
  /** This provider's own id for the content at `url`, or null if it is not a watch page. */
  rawId(url: URL): string | null;
  /** Canonical watch URL for one of this provider's raw ids, or null if it cannot be derived. */
  watchUrl(rawId: string): string | null;
  /** Canonicalise the raw id. HBO Max lowercases its uuids; Drive ids are case-sensitive and must not. */
  normalize?(rawId: string): string;
};

/** The common `rawId`: capture group 1 of a pattern run against the decoded pathname. */
const pathMatch = (re: RegExp) => (url: URL): string | null => decodeURIComponent(url.pathname).match(re)?.[1] ?? null;

function prefixedProvider(spec: PrefixedProviderSpec): ContentProvider {
  const prefix = `${spec.id}:`;
  return {
    id: spec.id,
    hosts: spec.hosts,
    matches: spec.matches,
    parseContentId(url) {
      const raw = spec.rawId(url);
      return raw ? `${prefix}${spec.normalize ? spec.normalize(raw) : raw}` : null;
    },
    ownsContentId: (id) => id.startsWith(prefix),
    watchUrl: (id) => spec.watchUrl(id.slice(prefix.length)),
  };
}

/**
 * HBO Max (inspected 2026-09-16): the app is `play.hbomax.com`, watch pages are
 * `/video/watch/<uuid>` with no URN anywhere, so the content id is `hbomax:<uuid>`.
 */
const HBOMAX_ORIGIN = 'https://play.hbomax.com';

export const hbomax: ContentProvider = prefixedProvider({
  id: 'hbomax',
  hosts: ['play.hbomax.com'],
  matches: ['https://play.hbomax.com/*'],
  rawId: pathMatch(/\/video\/watch\/([0-9a-f-]{36})/i),
  normalize: (uuid) => uuid.toLowerCase(),
  watchUrl: (uuid) => `${HBOMAX_ORIGIN}/video/watch/${uuid}`,
});

/**
 * Google Drive: watch pages are `/file/d/<fileId>/view`, and `/preview` for the
 * embeddable variant, so the content id is `gdrive:<fileId>`. File ids are
 * case-sensitive base64url, unlike HBO Max's lowercase uuids.
 *
 * Unlike a subscription service, everyone needs the *same* file shared with
 * their own Google account.
 *
 * ACCEPTED LIMITATION, not a TODO (decided 2026-09-19): an unqualified watch
 * URL resolves to the viewer's *first* Google account (`authuser=0`). On a
 * profile signed into several accounts, a viewer whose access sits on another
 * account gets "Unable to load video" rather than the show. `?authuser=<n>`
 * fixes it, but n is per-profile, so the leader's index is meaningless to a
 * follower — there is no index this function could emit that is correct for
 * everyone. The popup's "Go to episode" button inherits this; the workaround
 * is to open the file's URL directly. Deliberately left alone: do not "fix"
 * this by baking an account index into the watch URL.
 */
const GDRIVE_ORIGIN = 'https://drive.google.com';

export const gdrive: ContentProvider = prefixedProvider({
  id: 'gdrive',
  hosts: ['drive.google.com'],
  // Deliberately narrower than the host: the extension has no business in the
  // rest of Drive (My Drive, Docs, the picker), and a file-only pattern is the
  // one a store reviewer can be shown a reason for. rawId still reads any
  // `/file/d/<id>` path, so a Drive URL shape we have not seen degrades to
  // "recognised but not injected" rather than to a wrong content id.
  matches: ['https://drive.google.com/file/*'],
  rawId: pathMatch(/\/file\/d\/([A-Za-z0-9_-]{10,})/),
  // No normalize: Drive file ids are case-sensitive base64url, and lowercasing
  // them the way HBO Max does would collapse two genuinely different files.
  watchUrl: (fileId) => `${GDRIVE_ORIGIN}/file/d/${fileId}/view`,
});

/**
 * YouTube (inspected 2026-09-19): watch pages are `/watch?v=<id>`, so the id
 * lives in the query string rather than the path. `/live/<id>` is the same
 * video once the stream is over and `youtu.be/<id>` is the share link, so all
 * three parse to `youtube:<id>` and `watchUrl` always emits the canonical
 * `/watch?v=` form — whichever link a viewer was handed, the room agrees on
 * one content id and everyone lands on the same page.
 *
 * `youtu.be` is deliberately *not* one of `hosts`. It only ever redirects to
 * www.youtube.com, so a content script there would have no player to attach to,
 * and a host permission for a domain the extension never actually works on is
 * one a store reviewer cannot be given a reason for. It is still parsed,
 * because `parseContentId` falls back to trying every provider on an unknown
 * host — which is how a pasted share link resolves. That fallback is also why
 * the `youtu.be` branch is gated on the hostname: a bare `/<id>` path would
 * otherwise match half the web.
 *
 * Shorts are out of scope: the feed scrolls itself to the next video, which
 * walks a follower off the room's content with no panel to suppress.
 *
 * The match pattern is the whole host, not `/watch*`, because YouTube routes
 * client-side: Chrome injects a content script on the URL the tab *loaded*, so
 * a script scoped to watch pages would simply not exist for anyone who reached
 * the video from the home feed.
 */
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
/** Video ids are 11 chars of base64url. Narrow enough to tell an id from a page name. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const youtubeId = (raw: string | null | undefined): string | null => (raw && YOUTUBE_ID_RE.test(raw) ? raw : null);

export const youtube: ContentProvider = prefixedProvider({
  id: 'youtube',
  hosts: ['www.youtube.com'],
  matches: ['https://www.youtube.com/*'],
  rawId(url) {
    if (url.hostname === 'youtu.be') return youtubeId(url.pathname.slice(1));
    const path = decodeURIComponent(url.pathname);
    if (path === '/watch') return youtubeId(url.searchParams.get('v'));
    return youtubeId(path.match(/^\/live\/([^/]+)/)?.[1]);
  },
  // No normalize: video ids are case-sensitive base64url, like Drive's file ids.
  watchUrl: (id) => `${YOUTUBE_ORIGIN}/watch?v=${id}`,
});

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
export const PROVIDERS: readonly ContentProvider[] = [hbomax, gdrive, youtube, harness];

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
