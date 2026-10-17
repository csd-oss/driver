#!/usr/bin/env bash
# Driver for driving schools, everything local in one command:
#   project-local Postgres (schools/pg.sh) → Rust server (migrated, demo school seeded) → Vite dashboard.
#
#   schools/dev.sh            start; the first run creates the cluster, builds the server and installs web packages
#   schools/dev.sh --reset    drop the demo data and seed it again
#   schools/dev.sh --stop     stop Postgres (the server and Vite stop with Ctrl+C)
#
# Then open the URL it prints and sign in as jana@demo.sk / driver (admin) or peter@demo.sk / driver
# (instructor). Ports: API 8090, web 5190, Postgres 55436 (DEV_API_PORT, DEV_WEB_PORT, SCHOOLS_PG_PORT).
# Logs: schools/.dev-logs/. Needs: Rust (cargo), Node 20+, Homebrew postgresql@16 (no Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${DEV_API_PORT:-8090}"
WEB_PORT="${DEV_WEB_PORT:-5190}"
LOGS="$ROOT/.dev-logs"
mkdir -p "$LOGS"
export PATH="$HOME/.cargo/bin:$PATH"

say() { printf '\033[1;34mschools:\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mschools:\033[0m %s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  --stop) exec "$ROOT/pg.sh" stop ;;
  -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

for tool in cargo node npm curl; do command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed"; done
for port in "$API_PORT" "$WEB_PORT"; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then die "port $port is taken (DEV_API_PORT / DEV_WEB_PORT choose others)"; fi
done

"$ROOT/pg.sh" init >/dev/null
export DATABASE_URL
DATABASE_URL="$("$ROOT/pg.sh" url)"

say "building the server"
(cd "$ROOT/server" && cargo build -q)
BIN="${CARGO_TARGET_DIR:-$ROOT/server/target}/debug/schools"
if [ "${1:-}" = --reset ]; then
  "$BIN" seed --reset
fi

[ -d "$ROOT/web/node_modules" ] || (say "installing web packages" && cd "$ROOT/web" && npm install --no-audit --no-fund >/dev/null)

SERVER_PID=""
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
BIND_ADDR="127.0.0.1:$API_PORT" APP_URL="http://localhost:$WEB_PORT" \
  SCHOOLS_ALLOWED_ORIGINS="${SCHOOLS_ALLOWED_ORIGINS:-http://127.0.0.1:$WEB_PORT,http://localhost:8080,http://127.0.0.1:8080}" \
  "$BIN" serve > "$LOGS/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null || die "the server did not start: $LOGS/server.log"
grep -m1 "seeded\|already exists" "$LOGS/server.log" | sed 's/.*schools: //' || true
say "dashboard: http://localhost:$WEB_PORT  (API :$API_PORT, sign in as jana@demo.sk / driver)"
say "app: EXPO_PUBLIC_SCHOOLS_ENABLED=true EXPO_PUBLIC_SCHOOLS_API_URL=http://<this Mac's IP>:$API_PORT npx expo start"
cd "$ROOT/web"
API_TARGET="http://127.0.0.1:$API_PORT" WEB_PORT="$WEB_PORT" exec npx vite --port "$WEB_PORT" --strictPort
