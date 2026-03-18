#!/usr/bin/env bash
# Seed the database, start REST + MCP servers, and open a Cloudflare tunnel.
# Usage: bash demo/serve.sh
set -euo pipefail

API="http://localhost:3085/api"
DB="${DB_PATH:-opera.db}"

# ── Reset ────────────────────────────────────────────────────────────────
echo "Stopping any running servers..."
pkill -f 'bun.*server\.ts' 2>/dev/null || true
pkill -f 'bun.*mcp\.ts' 2>/dev/null || true
sleep 0.3

echo "Resetting database..."
rm -f "$DB" "$DB-wal" "$DB-shm"

# ── Start dev server (REST on :3085) ─────────────────────────────────────
echo "Starting dev server..."
AUTH_ENABLED=false bun dev >/dev/null 2>&1 &
DEV_PID=$!

# Wait for server to be ready
for i in $(seq 1 20); do
  if curl -s "$API/venues" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

# ── Seed ─────────────────────────────────────────────────────────────────
echo "Seeding venues..."
curl -s --fail-with-body -o /dev/null -X POST "$API/venues" -H 'Content-Type: application/json' \
  -d '{"name":"Minack Theatre","address":"Porthcurno","city":"Porthcurno","postcode":"TR19 6JU","capacity":60}'
curl -s --fail-with-body -o /dev/null -X POST "$API/venues" -H 'Content-Type: application/json' \
  -d '{"name":"Hall for Cornwall","address":"Back Quay","city":"Truro","postcode":"TR1 2LL","capacity":60}'
curl -s --fail-with-body -o /dev/null -X POST "$API/venues" -H 'Content-Type: application/json' \
  -d '{"name":"Truro Cathedral","address":"St Mary'\''s Street","city":"Truro","postcode":"TR1 2AF","capacity":60}'

echo "Seeding performances..."
curl -s --fail-with-body -o /dev/null -X POST "$API/performances" -H 'Content-Type: application/json' \
  -d '{"title":"La Traviata","venue_id":1,"date":"2026-03-22","time":"19:30","duration_mins":150}'
curl -s --fail-with-body -o /dev/null -X POST "$API/performances" -H 'Content-Type: application/json' \
  -d '{"title":"The Marriage of Figaro","venue_id":2,"date":"2026-03-23","time":"19:30","duration_mins":180}'
curl -s --fail-with-body -o /dev/null -X POST "$API/performances" -H 'Content-Type: application/json' \
  -d '{"title":"Carmen","venue_id":3,"date":"2026-03-28","time":"19:30","duration_mins":165}'

echo "Seeded."

# ── Start demo MCP HTTP server (on :3086) ────────────────────────────────
bun demo/mcp.ts --http &
MCP_PID=$!

trap "kill $DEV_PID $MCP_PID 2>/dev/null; exit" INT TERM

# ── Cloudflare tunnel ────────────────────────────────────────────────────
cloudflared tunnel --url http://localhost:3086 2>&1 | while read -r line; do
  echo "$line" >&2
  if [[ "$line" =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
    URL="${BASH_REMATCH[0]}/mcp"
    echo "$URL" | pbcopy
    echo ""
    echo "✦ MCP endpoint copied to clipboard:"
    echo "  $URL"
    echo ""
  fi
done

wait
