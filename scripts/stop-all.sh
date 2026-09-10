#!/usr/bin/env bash
#
# Stops every DineEasy dev process this project can start locally: the three Node dev servers
# (`dev:api`/`dev:pos`/`dev:web`, whether started together via `npm run dev:all` or separately
# in their own terminals), the print agent if it's running (`dev:print` — optional, see
# docs/local-development.md step 8), and the Postgres/Redis containers from `docker:up`.
#
# Companion to `npm run dev:all` (see root package.json + docs/local-development.md's
# "start/stop everything at once" section) — `dev:all` runs api/pos/web under `concurrently` in
# one foreground terminal, where Ctrl+C already stops all three; this script is for stopping
# them from a *different* terminal (the dev:all terminal was closed, or they were started the
# old way as separate `npm run dev:*` processes). Every step here is best-effort and safe to run
# even if some or all of these aren't currently running.
set -uo pipefail
cd "$(dirname "$0")/.."

# API_PORT defaults to 3000 (.env.example) but is configurable — read the real value from a
# local .env if one exists, so this still finds the right process on a machine that changed it.
# pos_web (3001) and customer_web (5173, Vite's own default) are fixed — see .env.example's
# CORS_ORIGINS comment and docs/local-development.md steps 5/6.
API_PORT="$(grep -E '^API_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
API_PORT="${API_PORT:-3000}"

kill_port() {
  local port="$1" label="$2" pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    # fuser prints the pid(s) themselves on stdout when given -k; without -k it also prints to
    # stdout on most Linux distros, but the format is less predictable across versions than
    # lsof's, so this is the deliberate fallback (only reached where lsof genuinely isn't
    # installed), not the primary path.
    pids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  else
    echo "  (no lsof or fuser available — can't check port $port for $label, skipping)"
    return
  fi
  if [ -n "$pids" ]; then
    echo "  stopping $label — port $port, pid(s): $pids"
    kill $pids 2>/dev/null || true
  fi
}

echo "Stopping DineEasy dev servers..."
kill_port "$API_PORT" "api (dev:api)"
kill_port 3001 "pos_web (dev:pos)"
kill_port 5173 "customer_web (dev:web)"

# print-agent binds no port — it's an outbound poller against the API, not a server (see
# services/print-agent/src/poll-loop.ts) — so it's matched by its distinctive command line
# instead. Only ever running if someone ran `npm run dev:print` themselves; harmless no-op
# otherwise, and this never touches a compiled `node dist/index.js` instance (npm start), only
# the ts-node dev invocation dev:print itself runs.
if pgrep -f "ts-node src/index.ts" >/dev/null 2>&1; then
  echo "  stopping print-agent (dev:print)"
  pkill -f "ts-node src/index.ts" 2>/dev/null || true
fi

echo "Stopping Postgres + Redis containers (docker:down)..."
npm run docker:down --silent 2>&1 | sed 's/^/  /'

echo "Done."
