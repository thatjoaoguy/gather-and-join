/**
 * DOM-level half of a streaming provider. The URL-level half (hosts, content
 * ids, watch URLs) is the shared `ContentProvider` with the same id; this is
 * everything the content script needs from the page itself.
 */
/**
 * The ordinary case: the player's media is a plain <video> in the page. Shared
 * so the providers that use it, and VideoBinding's fallback, cannot disagree
 * about what "find the video" means.
 */
export const queryVideo = (root: ParentNode): HTMLVideoElement | null => root.querySelector('video');

export type PlayerAdapter = {
  readonly providerId: string;
  /**
   * The player's current media handle, or null. Called on every DOM mutation;
   * keep it cheap. Usually the page's <video>, but a provider whose player
   * lives in a cross-origin iframe (Google Drive) returns a <video>-shaped
   * facade instead — see yt-embed-media.ts. Must return the *same* object for
   * the same underlying player, or VideoBinding will re-wire on every scan.
   */
  findVideo(root: ParentNode): HTMLVideoElement | null;
  /**
   * The real element the sidebar lays out around. Defaults to findVideo, which
   * is right whenever the media is a genuine element; a facade is not an
   * Element, so those providers must point at the iframe instead.
   */
  findAnchor?(root: ParentNode): HTMLElement | null;
  /** Autoplay-next panel: the panel elements to hide, and the dismiss buttons inside them to click. */
  readonly upNext: { readonly panel: readonly string[]; readonly dismiss: readonly string[] };
};
