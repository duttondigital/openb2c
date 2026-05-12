# Generated REST API

Generated REST endpoints use a small set of runtime conventions so clients do not need per-application wiring.

## Optimistic Concurrency

Tables with an `updated_at` column automatically opt into optimistic concurrency:

- `GET /api/<entities>/{id}` returns an `ETag` header.
- `PUT`, `DELETE`, and custom operation endpoints accept an optional `If-Match` header.
- If `If-Match` is stale, the generated service returns `409` with code `conflict`.
- Generated updates and mutating custom operations maintain `updated_at` themselves. Client-provided `updated_at` values are ignored on updates.
- CORS responses expose `ETag` and allow `If-Match`, so browser clients can participate in the same flow.

If `If-Match` is omitted, writes remain backwards compatible and proceed normally.
