#!/usr/bin/env bash
# Project-local Postgres for Driver for driving schools: Homebrew postgresql@16 binaries,
# data in schools/.pg/ (gitignored), port 55436, database `schools`, role `schools`
# (CREATEDB so `#[sqlx::test]` can make throwaway databases). Never `brew services`.
#
#   schools/pg.sh init     create the cluster, the role and the database (once), and start it
#   schools/pg.sh start    start it (no-op when running)
#   schools/pg.sh stop     stop it
#   schools/pg.sh status   running or not, and the URL
#   schools/pg.sh url      print DATABASE_URL
#   schools/pg.sh psql     psql into the schools database
set -euo pipefail
export LC_ALL="${SCHOOLS_PG_LOCALE:-en_US.UTF-8}" LANG="${SCHOOLS_PG_LOCALE:-en_US.UTF-8}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGDIR="$ROOT/.pg"
DATA="$PGDIR/data"
RUN="$PGDIR/run"
LOG="$PGDIR/postgres.log"
PORT="${SCHOOLS_PG_PORT:-55436}"
BIN="${SCHOOLS_PG_BIN:-}"
if [ -z "$BIN" ]; then
  for candidate in /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin /usr/lib/postgresql/16/bin /usr/local/opt/postgresql@16/bin; do
    [ -x "$candidate/pg_ctl" ] && BIN="$candidate" && break
  done
fi
URL="postgres://schools@localhost:$PORT/schools"

[ -n "$BIN" ] && [ -x "$BIN/pg_ctl" ] || { echo "pg.sh: no postgresql@16 found (brew install postgresql@16, or set SCHOOLS_PG_BIN)" >&2; exit 1; }

running() { "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; }

start() {
  [ -f "$DATA/PG_VERSION" ] || { echo "pg.sh: no cluster yet, run: schools/pg.sh init" >&2; exit 1; }
  if running; then return 0; fi
  mkdir -p "$RUN"
  "$BIN/pg_ctl" -D "$DATA" -l "$LOG" -w -t 30 \
    -o "-p $PORT -k $RUN -c listen_addresses=localhost -c unix_socket_permissions=0700" start >/dev/null
}

case "${1:-status}" in
  init)
    if [ -f "$DATA/PG_VERSION" ]; then
      echo "pg.sh: cluster exists at $DATA"
    else
      mkdir -p "$PGDIR"
      "$BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
      cat >"$DATA/pg_hba.conf" <<'HBA'
local   all  all                trust
host    all  all  127.0.0.1/32  trust
host    all  all  ::1/128       trust
HBA
      {
        echo "max_connections = 200"
        echo "idle_in_transaction_session_timeout = '60s'"
      } >>"$DATA/postgresql.conf"
    fi
    start
    "$BIN/psql" -h "$RUN" -p "$PORT" -U postgres -d postgres -qtAc \
      "SELECT 1 FROM pg_roles WHERE rolname = 'schools'" | grep -q 1 \
      || "$BIN/psql" -h "$RUN" -p "$PORT" -U postgres -d postgres -qc "CREATE ROLE schools LOGIN CREATEDB"
    "$BIN/psql" -h "$RUN" -p "$PORT" -U postgres -d postgres -qtAc \
      "SELECT 1 FROM pg_database WHERE datname = 'schools'" | grep -q 1 \
      || "$BIN/createdb" -h "$RUN" -p "$PORT" -U postgres -O schools schools
    echo "pg.sh: ready at $URL"
    ;;
  start) start; echo "pg.sh: running at $URL" ;;
  stop)
    if running; then "$BIN/pg_ctl" -D "$DATA" -m fast -w stop >/dev/null; fi
    echo "pg.sh: stopped"
    ;;
  status)
    if running; then echo "pg.sh: running at $URL"; else echo "pg.sh: stopped"; exit 3; fi
    ;;
  url) echo "$URL" ;;
  psql) shift; exec "$BIN/psql" -h "$RUN" -p "$PORT" -U schools -d schools "$@" ;;
  *) echo "usage: schools/pg.sh init|start|stop|status|url|psql" >&2; exit 2 ;;
esac
