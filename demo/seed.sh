#!/usr/bin/env bash
# Reset DB and seed venues + performances for the demo.
# Usage: bash demo/seed.sh
#   — kills any running dev server, deletes the DB, restarts, and seeds.
set -euo pipefail

API="http://localhost:3085/api"
DB="${DB_PATH:-opera.db}"

echo "Stopping server..."
pkill -f 'bun.*server\.ts' 2>/dev/null || true
sleep 0.3

echo "Resetting database..."
rm -f "$DB" "$DB-wal" "$DB-shm"

echo "Starting server..."
AUTH_ENABLED=false bun dev >/dev/null 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT

# Wait for server to be ready
for i in $(seq 1 20); do
  if curl -s "$API/venues" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

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

echo "Done. Server running on :3085 (PID $SERVER_PID)"
trap - EXIT
