/**
 * Fake player, served on localhost, in three shapes: HBO (a <video> in the top
 * document), Drive (`/drivewatch/`, a cross-origin embed) and YouTube
 * (`/ytwatch/`, a <video> whose ad break reuses the same element). Between them
 * they reproduce the hazards the extension must survive: element recreation,
 * ad breaks of both kinds, SPA and hard navigation, autoplay-next countdown.
 * See player/player.js for the HBO page.
 *
 * Media: prefers `fixtures/player.webm` (from `make fixtures`); otherwise serves
 * a generated 5-minute WAV — <video> plays audio-only sources with full
 * currentTime/seek/duration semantics, which is all sync needs.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quietTrack } from './wav.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLAYER_DIR = path.join(ROOT, 'player');
const FIXTURES = path.join(ROOT, 'fixtures');

export const PLAYER_PORT = Number(process.env.PLAYER_PORT ?? 4173);
export const MAIN_SECONDS = 330;
export const AD_SECONDS = 15;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.wav': 'audio/wav',
};

type Media = { body: Buffer; mime: string };
let mainMedia: Media | null = null;
let adMedia: Media | null = null;

function loadMedia(): { main: Media; ad: Media } {
  if (!mainMedia) {
    const webm = path.join(FIXTURES, 'player.webm');
    mainMedia = fs.existsSync(webm)
      ? { body: fs.readFileSync(webm), mime: 'video/webm' }
      : { body: quietTrack(MAIN_SECONDS), mime: 'audio/wav' };
    adMedia = { body: quietTrack(AD_SECONDS), mime: 'audio/wav' };
  }
  return { main: mainMedia, ad: adMedia! };
}

function serveMedia(req: http.IncomingMessage, res: http.ServerResponse, media: Media) {
  const total = media.body.length;
  const range = req.headers.range;
  const headers: Record<string, string | number> = {
    'Content-Type': media.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : total - 1;
    if (start >= total) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); return res.end(); }
    end = Math.min(end, total - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
    return res.end(media.body.subarray(start, end + 1));
  }
  res.writeHead(200, { ...headers, 'Content-Length': total });
  res.end(media.body);
}

function serveFile(res: http.ServerResponse, file: string) {
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

export function startPlayerServer(port = PLAYER_PORT): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const p = decodeURIComponent(url.pathname);
    if (p === '/') { res.writeHead(302, { Location: '/watch/urn:hbo:episode:G0000001' }); return res.end(); }
    if (p === '/media/main') return serveMedia(req, res, loadMedia().main);
    if (p === '/media/ad') return serveMedia(req, res, loadMedia().ad);
    if (p.startsWith('/watch/urn:hbo:')) return serveFile(res, path.join(PLAYER_DIR, 'index.html'));
    // Drive-shaped variant: no <video> in the top document, playback in a
    // cross-origin iframe driven by the YouTube widget postMessage protocol.
    if (p.startsWith('/drivewatch/')) return serveFile(res, path.join(PLAYER_DIR, 'drive-top.html'));
    if (p === '/ytembed') return serveFile(res, path.join(PLAYER_DIR, 'yt-embed.html'));
    // YouTube-shaped variant: an ordinary <video>, but its ad break plays through
    // that same element and is announced only by a class on the player.
    if (p.startsWith('/ytwatch/')) return serveFile(res, path.join(PLAYER_DIR, 'yt-top.html'));
    if (p.startsWith('/static/')) return serveFile(res, path.join(PLAYER_DIR, p.slice('/static/'.length)));
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    console.log(`[gj-player] http://localhost:${port}/  media=${loadMedia().main.mime}`);
    resolve(server);
  }));
}

if (process.argv[1] && /player-server\.ts$/.test(process.argv[1])) startPlayerServer();
