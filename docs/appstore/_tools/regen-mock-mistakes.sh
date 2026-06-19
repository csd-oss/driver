#!/usr/bin/env bash
# Re-capture + reframe ONLY the mock + mistakes screenshots (EN/SK/HU).
# Run AFTER the Release build is installed on the 6.9" simulator.
set -euo pipefail
cd "$(dirname "$0")/../../.."   # project root

SIM=BEDA91C2-1D31-42D4-B337-B90EC456FFC6
APP=com.smartie.driver
DB="$(xcrun simctl get_app_container $SIM $APP data)/Documents/SQLite/driver.db"
MAESTRO="$HOME/.maestro/bin/maestro"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"

echo "== launch once so migrations create the DB =="
xcrun simctl launch $SIM $APP >/dev/null 2>&1 || true
sleep 9
xcrun simctl terminate $SIM $APP >/dev/null 2>&1 || true

echo "== seed demo state (DB: $DB) =="
node docs/appstore/_tools/seed.js | sqlite3 "$DB"

# lang: EN=2, SK=1, HU=3 ; per-lang clean text-only mock test index
echo "== capture EN (t=62) =="
sqlite3 "$DB" "UPDATE settings SET lang=2;"
xcrun simctl terminate $SIM $APP >/dev/null 2>&1 || true
"$MAESTRO" --device $SIM test -e LANG_DIR=en -e MOCK_TEST=62 docs/appstore/_tools/capture-mock-mistakes.yaml

echo "== capture SK (t=97) =="
sqlite3 "$DB" "UPDATE settings SET lang=1;"
xcrun simctl terminate $SIM $APP >/dev/null 2>&1 || true
"$MAESTRO" --device $SIM test -e LANG_DIR=sk -e MOCK_TEST=97 docs/appstore/_tools/capture-mock-mistakes.yaml

echo "== capture HU (t=15) =="
sqlite3 "$DB" "UPDATE settings SET lang=3;"
xcrun simctl terminate $SIM $APP >/dev/null 2>&1 || true
"$MAESTRO" --device $SIM test -e LANG_DIR=hu -e MOCK_TEST=15 docs/appstore/_tools/capture-mock-mistakes.yaml

echo "== frame all slots (only mock+mistakes raws changed) =="
node docs/appstore/_tools/render.js

echo "== done; raw mock/mistakes + framed regenerated =="
