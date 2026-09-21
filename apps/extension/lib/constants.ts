export const DEFAULT_SERVER_URL = 'ws://localhost:8080';
/** Where someone with no address to paste goes to get one. Lives on the docs branch. */
export const HOST_GUIDE_URL = 'https://thatjoaoguy.github.io/gather-and-join/docs/host-a-server';
export const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export type Sabotage = 'reattach' | 'drift' | 'offscreen' | 'echo-suppress' | null;
