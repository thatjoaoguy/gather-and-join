/**
 * DOM-level half of a streaming provider. The URL-level half (hosts, content
 * ids, watch URLs) is the shared `ContentProvider` with the same id; this is
 * everything the content script needs from the page itself.
 */
export type PlayerAdapter = {
  readonly providerId: string;
  /** The player's current <video>, or null. Called on every DOM mutation; keep it cheap. */
  findVideo(root: ParentNode): HTMLVideoElement | null;
  /** Autoplay-next panel: the panel elements to hide, and the dismiss buttons inside them to click. */
  readonly upNext: { readonly panel: readonly string[]; readonly dismiss: readonly string[] };
};
