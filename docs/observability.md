# Observability

Generated REST servers emit structured JSON logs and expose lightweight in-process metrics for single-server deployments.

## Request Logs

Every completed HTTP request writes one JSON log entry with:

- `requestId` from `X-Request-ID` or a generated UUID.
- `correlationId` from `X-Correlation-ID` or the request ID.
- `method`, `path`, `status`, and `ms`.

Responses include `X-Request-ID` and `X-Correlation-ID`, and CORS exposes both headers.

## Metrics

`GET /ops/metrics` returns the current process metrics snapshot. In production it is protected by the same ops auth boundary as the other `/ops/*` endpoints.

The response includes process start time, uptime, total completed requests, counts by status, counts by `METHOD path`, and request duration aggregates.

These counters reset on process restart. For longer retention, collect the structured request logs into the deployment logging system and derive service-level metrics from the same `status`, `path`, and `ms` fields.

## Startup Diagnostics

On boot, generated REST servers emit one `startup diagnostics` JSON log after config validation, database bootstrap, migrations, seed data, and registry initialization complete.

The diagnostics report app version, redacted runtime config, migration statuses, integration providers, and whether each configured environment variable is present. Secret values are never logged.

## Shutdown

Generated REST servers handle `SIGINT` and `SIGTERM` by logging `shutdown requested`, stopping the Bun server, closing the SQLite database handle, logging `shutdown complete`, and exiting with status `0`. Shutdown failures are logged and exit with status `1`.
