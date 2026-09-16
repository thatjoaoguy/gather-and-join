export const DEFAULT_SERVER_URL = 'ws://localhost:8080';
export const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export type Sabotage = 'reattach' | 'drift' | 'offscreen' | 'echo-suppress' | null;
