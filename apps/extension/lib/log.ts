/**
 * Diagnostics log. One ring buffer per extension realm (background, offscreen,
 * page), mirrored to `chrome.storage.session` so the setup page can copy it and
 * so it survives Chrome restarting the service worker or the offscreen document.
 * Nothing leaves the browser.
 *
 * Pages (content scripts) cannot reach session storage; they hand their lines to
 * the offscreen document over the player port (`installLogSink`), which appends
 * them to its own buffer (`appendLogLine`).
 */
import { kvGet, kvSet } from './kv';

export const LOG_MAX_LINES = 400;
const FLUSH_MS = 250;

type Sink = (line: string) => void;

export const LOG_REALM = detectRealm();
const key = `gjLog:${LOG_REALM}`;
const lines: string[] = [];
let tag = '';
let sink: Sink | null = LOG_REALM === 'page' ? null : storageSink;
let flush: ReturnType<typeof setTimeout> | null = null;
let primed: Promise<void> | null = null;

export function log(ctx: string, ...args: unknown[]) {
  const line = `${stamp()} [${ctx}${tag}] ${args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ')}`;
  console.log(line);
  sink?.(line);
}

/** Pages: send lines somewhere else (the offscreen port). `pageTag` tells one page load from the next. */
export function installLogSink(s: Sink, pageTag?: string) {
  sink = s;
  if (pageTag) tag = `@${pageTag}`;
}

/** Append a line produced by another realm (a page's forwarded line) to this realm's buffer. */
export function appendLogLine(line: string) { storageSink(line); }

function storageSink(line: string) {
  lines.push(line);
  if (lines.length > LOG_MAX_LINES) lines.splice(0, lines.length - LOG_MAX_LINES);
  flush ??= setTimeout(() => { flush = null; void persist(); }, FLUSH_MS);
}

let warnedUnwritable = false;

async function persist() {
  try {
    primed ??= prime();
    await primed;
    await kvSet('session', { [key]: lines.slice() });
    warnedUnwritable = false;
  } catch (e) {
    // Unit tests have no storage, and a context on its way out cannot write either, so
    // this stays quiet — but a realm that reaches chrome.storage through the service
    // worker (the offscreen document) writes nothing at all once that stops answering,
    // and an empty diagnostics log then reads as "nothing happened". Say it once.
    if (warnedUnwritable) return;
    warnedUnwritable = true;
    console.warn(`[${LOG_REALM}] diagnostics log is not reaching chrome.storage.session:`, e);
  }
}

/** First write after a restart: keep what the previous incarnation of this realm logged, behind a marker. */
async function prime() {
  const prev = (await kvGet('session', [key]))[key];
  if (!Array.isArray(prev) || prev.length === 0) return;
  const keep = prev.filter((l): l is string => typeof l === 'string').slice(-(LOG_MAX_LINES - lines.length - 1));
  lines.unshift(...keep, `${stamp()} [${LOG_REALM}] --- restarted (lines above are from the previous ${LOG_REALM}) ---`);
}

function detectRealm(): string {
  // The service worker has a `location` (…/background.js) but no document; so does node under vitest.
  if (typeof document === 'undefined') return 'background';
  if (location.protocol === 'chrome-extension:') return location.pathname.replace(/^\/+|\.html$/g, '') || 'extension';
  return 'page';
}

function stamp() { return new Date().toISOString().slice(11, 23); }
function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
