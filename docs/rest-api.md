# Generated REST API

Generated REST endpoints use a small set of runtime conventions so clients do not need per-application wiring.

## API Versioning

Generated APIs use the system-generated application version as the runtime API version. Clients may omit version negotiation and use the current generated API, or send `X-OpenB2C-API-Version` to pin the expected version.

- Every JSON response includes `X-OpenB2C-API-Version`.
- `GET /health` includes the same version in its body.
- Requests with an unsupported `X-OpenB2C-API-Version` value return `400` with code `unsupported_version`.
- Generated OpenAPI includes `x-openb2c-api-versioning` with the current version and header names.

## Optimistic Concurrency

Tables with an `updated_at` column automatically opt into optimistic concurrency:

- `GET /api/<entities>/{id}` returns an `ETag` header.
- `PUT`, `DELETE`, and custom operation endpoints accept an optional `If-Match` header.
- If `If-Match` is stale, the generated service returns `409` with code `conflict`.
- Generated updates and mutating custom operations maintain `updated_at` themselves. Client-provided `updated_at` values are ignored on updates.
- CORS responses expose `ETag` and allow `If-Match`, so browser clients can participate in the same flow.

If `If-Match` is omitted, writes remain backwards compatible and proceed normally.
