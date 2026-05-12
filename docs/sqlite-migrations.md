# SQLite Migrations

Generated servers keep applied migration history in `openb2c_migration`.

## Runtime Behavior

On startup the generated server:

1. Creates `openb2c_migration` if it does not exist.
2. Applies sorted `*.sql` files from the generated `migrations/` directory when the database already has user tables.
3. Applies the generated `schema.sql` as a baseline or schema sync.
4. Records each migration id, checksum, description, and timestamp.

Fresh databases apply the current generated schema directly. Existing databases apply explicit migration files first, then run the generated schema sync so new tables and indexes declared with `IF NOT EXISTS` are present.

## Generating Stubs

Use the codegen migration planner with old and new schema JSON to produce additive migration stubs. Safe automatic steps include:

- Creating new tables.
- Adding nullable columns or columns with defaults.
- Creating new indexes and unique indexes.

Manual steps are emitted for destructive or data-sensitive changes such as dropping tables, dropping columns, changing column definitions, adding required columns without defaults, or adding primary-key/unique columns.

## Backups

Before applying migrations in staging or production:

```bash
sqlite3 app.db "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 app.db ".backup 'backup/app-$(date +%Y%m%d-%H%M%S).db'"
sqlite3 backup/app-YYYYmmdd-HHMMSS.db "PRAGMA integrity_check;"
```

Keep the backup outside the deployment directory and retain the generated code version that produced it.

## Maintenance

For a single-server Bun + SQLite deployment, schedule maintenance from the host that owns the writable database file.

Run lightweight planner/statistics maintenance regularly while the service is healthy:

```bash
sqlite3 app.db "PRAGMA optimize;"
```

Checkpoint WAL files before backups and after unusually heavy write periods:

```bash
sqlite3 app.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

Use `VACUUM` only in a maintenance window after stopping the service or making the database read-only to the application, because it rewrites the database file and needs exclusive access:

```bash
sqlite3 app.db "VACUUM;"
sqlite3 app.db "PRAGMA integrity_check;"
```

Keep enough free disk space for the live database, WAL files, and at least one fresh verified backup. Alert on disk usage before SQLite runs out of space.

## Rollback And Forward Fixes

SQLite DDL rollback is limited. The default rollback procedure is to stop the service, restore the latest verified backup, and restart with the previous generated app version.

For shared environments, prefer forward-fix migrations after a migration has been observed by other systems. Do not edit a migration file after it has been applied; the runtime verifies checksums and will refuse to continue if an applied file changes. Add a new numbered SQL file that repairs data or advances the schema.

## Restore Drill

Practice this before production and after any schema or operationally significant release. A restore drill must never overwrite the production database; restore into an isolated path and prove the generated app can run against that copy. Run the drill from the generated release directory that contains `server.ts`.

```bash
restore_dir="$(mktemp -d)"
backup="/var/backups/openb2c/app-YYYYmmdd-HHMMSS.db"
cp "$backup" "$restore_dir/app.db"
sqlite3 "$restore_dir/app.db" "PRAGMA integrity_check;"
sqlite3 "$restore_dir/app.db" "SELECT id, checksum, applied_at FROM openb2c_migration ORDER BY applied_at;"
DB_PATH="$restore_dir/app.db" PORT=3099 AUTH_ENABLED=false bun generated/server.ts &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
curl --retry 10 --retry-connrefused -fsS http://127.0.0.1:3099/health
```

The drill passes only when:

- `PRAGMA integrity_check;` returns `ok`.
- `openb2c_migration` exists and shows the expected migration history for the generated code version under test.
- The generated server starts successfully and startup diagnostics report the restored `DB_PATH`.
- `GET /health` succeeds against the restored server.
- A representative read flow works for each important entity.
- A representative write flow works against the restored copy, or the drill explicitly records why the backup was validated read-only.
- The operator records the backup file, app version, restore time, validation result, and follow-up actions.

For an emergency production restore, stop the service, verify the selected backup, replace the database file, remove stale WAL sidecars, then restart:

```bash
sudo systemctl stop openb2c-duchyopera.service
backup="/var/backups/openb2c/duchyopera/app-YYYYmmdd-HHMMSS.db"
sqlite3 "$backup" "PRAGMA integrity_check;"
sudo install -o openb2c -g openb2c -m 0600 "$backup" /var/lib/openb2c/duchyopera/app.db
sudo rm -f /var/lib/openb2c/duchyopera/app.db-wal /var/lib/openb2c/duchyopera/app.db-shm
sudo systemctl start openb2c-duchyopera.service
curl -fsS http://127.0.0.1:3085/health
```

If the failed release applied migrations, restore the matching generated app release as well as the matching database backup. Do not start an older generated release against a newer migrated database unless the migration plan explicitly says that downgrade is supported.
