#!/usr/bin/env bash
# Host a party from this machine for people outside your network, for free:
# runs the signaling server and a Cloudflare quick tunnel, prints the wss:// URL
# everyone puts in the extension's setup page. Ctrl-C stops both.
#
#   pnpm host            # server on 8080 + tunnel
#   PORT=9000 pnpm host
set -euo pipefail
PORT="${PORT:-8080}"
CF="$(command -v cloudflared || true)"
[ -z "$CF" ] && [ -x "$HOME/.local/bin/cloudflared" ] && CF="$HOME/.local/bin/cloudflared"
if [ -z "$CF" ]; then
  echo "cloudflared not found. Install: brew install cloudflared  (or https://github.com/cloudflare/cloudflared/releases)" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
PORT="$PORT" node --experimental-strip-types apps/server/src/index.ts &
SERVER=$!
LOG="$(mktemp)"
# http2 rather than QUIC: on flaky networks (hotspots) QUIC sits in minutes-long retry loops.
"$CF" tunnel --protocol http2 --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TUNNEL=$!
trap 'kill $SERVER $TUNNEL 2>/dev/null; exit 0' INT TERM
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 0.5
done
if [ -z "$URL" ]; then echo "tunnel did not come up; see $LOG" >&2; kill $SERVER $TUNNEL 2>/dev/null; exit 1; fi
echo
echo "  Server URL for everyone's setup page:   wss://${URL#https://}"
echo
echo "  Keep this terminal open and this machine awake for the whole party. Ctrl-C to stop."
wait $SERVER
