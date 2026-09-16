/**
 * Content identity, resolved through the provider registry (`providers.ts`).
 */
import { PROVIDERS, providerForHost, providerForContentId } from './providers.ts';

/**
 * Content id for a page URL. The provider is picked by host; a URL on an
 * unknown host is still tried against every provider so a redirected player
 * domain degrades to "works" rather than "silently not a watch page".
 */
export function parseContentId(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const byHost = providerForHost(u.hostname);
  if (byHost) return byHost.parseContentId(u);
  for (const p of PROVIDERS) {
    const id = p.parseContentId(u);
    if (id) return id;
  }
  return null;
}

/** Canonical watch URL for a content id, when the client did not supply one. */
export function watchUrlFor(contentId: string): string | null {
  return providerForContentId(contentId)?.watchUrl(contentId) ?? null;
}
