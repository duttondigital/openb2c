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

## Rollback And Forward Fixes

SQLite DDL rollback is limited. The default rollback procedure is to stop the service, restore the latest verified backup, and restart with the previous generated app version.

For shared environments, prefer forward-fix migrations after a migration has been observed by other systems. Do not edit a migration file after it has been applied; the runtime verifies checksums and will refuse to continue if an applied file changes. Add a new numbered SQL file that repairs data or advances the schema.

## Restore Drill

Practice this before production:

```bash
cp backup/app-YYYYmmdd-HHMMSS.db restore-test.db
sqlite3 restore-test.db "PRAGMA integrity_check;"
DB_PATH=restore-test.db PORT=0 bun generated/server.ts
```

Confirm startup succeeds, migration history is intact, and key read/write flows work against the restored database.
