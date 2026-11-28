export const DEFAULT_SERVER_URL = 'ws://localhost:8080';
/** The browser this build runs in, for copy that names it ("Chrome asks once"). Chrome's copy stays word for word. */
export const BROWSER_NAME = import.meta.env.BROWSER === 'firefox' ? 'Firefox' : 'Chrome';
/** Where someone with no address to paste goes to get one. Lives on the docs branch. */
export const HOST_GUIDE_URL = 'https://thatjoaoguy.github.io/gather-and-join/docs/host-a-server';
export const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export type Sabotage = 'reattach' | 'drift' | 'offscreen' | 'echo-suppress' | 'episode-start' | 'ad-pod' | 'stall-position' | 'stall-guard' | null;
