# Production Readiness Roadmap

This is the checklist for getting OpenB2C from a working prototype to the stated goal: a general-purpose composable system where a small set of Nix ontology files can generate a production-ready backend, API, MCP server, and web client for a bespoke business system.

## Production-Ready Definition

OpenB2C is production-ready when a new project can:

- [ ] Declare its domain model, workflows, permissions, integrations, and UI metadata in Nix.
- [ ] Generate a working SQLite-backed Bun service with REST, MCP, OpenAPI, and web client outputs from that single source of truth.
- [ ] Run safely with authentication, authorization, rate limits, request limits, migrations, and secrets management enabled by default.
- [ ] Execute declared effects through real integration handlers such as email, payment, webhook, and background jobs.
- [ ] Evolve schemas and generated code without losing live data or requiring manual rewrites.
- [ ] Ship with repeatable deployment, observability, backup, restore, and upgrade procedures.
- [ ] Prove core behavior with generated and hand-authored tests across REST, MCP, services, UI, and migrations.

## Done

- [x] Nix schema definitions for core public ticketing modules.
- [x] Nix schema definitions for internal issue tracking modules.
- [x] Composition files for Duchy Opera and ticketing examples.
- [x] Codegen: SQLite schema.
- [x] Codegen: TypeScript row and input types.
- [x] Codegen: TypeScript services.
- [x] Codegen: declared operation effects.
- [x] Codegen: REST server.
- [x] Codegen: MCP server.
- [x] Codegen: OpenAPI spec.
- [x] Codegen: basic generated CRUD web UI.
- [x] Business logic: guards, cascades, and declared effects.
- [x] Input validation for email, UK postcode, phone, date, and time fields.
- [x] Pagination with `limit` and `offset` on list endpoints.
- [x] Filtering with query params mapped to SQL `WHERE` clauses.
- [x] Sorting with `sort` and `order` query params.
- [x] Health check endpoint at `/health`.
- [x] Structured JSON logging.
- [x] Consistent error shape with `error`, `code`, and optional `details`.
- [x] API key auth using Bearer tokens and scopes.
- [x] API key hashing with bcrypt through `Bun.password`.
- [x] API key prefix lookup without exposing full secrets.
- [x] Hide identity OTP code in production responses.
- [x] Schema dependency ordering through topological sort for foreign keys.
- [x] Federated identity prototype using Ed25519 keypairs and email verification.
- [x] Certificate-based request authentication prototype.

## P0 - Production Blockers

These must be complete before calling any generated app production-ready.

### Remove Example-Specific Assumptions

- [x] Add top-level organization metadata to the ontology, with slugs, ports, versions, and generated app/API/MCP/UI metadata handled by codegen/system defaults.
- [x] Remove hard-coded Duchy Opera names from generated MCP server metadata.
- [x] Remove hard-coded Duchy Opera names from generated OpenAPI metadata.
- [x] Replace default `opera.db` database path with generated app-specific defaults.
- [x] Make generated server, MCP, OpenAPI, and UI config derive from organization metadata plus system defaults.
- [x] Add tests that generate both example apps and assert app metadata does not leak across examples.

### Authentication And Authorization

- [x] Define an auth context type shared by generated REST handlers, services, MCP handlers, and UI clients.
- [x] Pass authenticated identity or API key context into generated route handlers.
- [x] Pass auth context into generated services and operation functions.
- [x] Add ontology support for per-entity read, create, update, delete, and operation permissions.
- [x] Add ontology support for owner-scoped rules such as `user_id == auth.userId`.
- [x] Enforce resource ownership for tickets, transactions, comments, issues, and any user-owned records.
- [x] Enforce operation-specific permissions, not only coarse `read` and `write` scopes.
- [x] Add service-level authorization tests for allowed and denied cases.
- [x] Add REST authorization tests for allowed and denied cases.
- [x] Add MCP authorization tests for allowed and denied cases.

### Identity Hardening

- [x] Fix async registry key initialization race by awaiting key setup before serving requests.
- [x] Enforce certificate revocation by checking `identity_registry.revoked`.
- [x] Decide whether certificate verification needs local database state, external registry state, or both.
- [x] Rate limit identity challenge creation by email, public key, IP, and time window.
- [x] Rate limit identity verification attempts by challenge ID and email.
- [x] Store OTP hashes instead of plaintext OTP codes.
- [x] Add challenge cleanup for expired and used challenges.
- [x] Add certificate rotation and re-issuance flow.
- [x] Add identity tests for expired, revoked, malformed, replayed, and wrong-key certificates.

### Request Safety

- [x] Add request body size limits.
- [x] Validate JSON content type for endpoints that require JSON.
- [x] Return structured `400` errors for malformed JSON instead of falling into generic `500`.
- [x] Clamp pagination limits to safe maximums.
- [x] Add route-level timeout handling for slow effect or integration work.
- [x] Add CORS configuration instead of always using wildcard origins.
- [x] Add secure defaults for production mode.

### Data Integrity And Migrations

- [x] Add ontology support for indexes.
- [x] Generate `CREATE INDEX` statements from schema metadata.
- [x] Add unique constraints to junction tables such as `performance_artist`, `transaction_ticket`, and `issue_label`.
- [x] Add a migration system for evolving schemas without data loss.
- [x] Store applied migration history in the database.
- [x] Generate migration plans or migration stubs from schema diffs.
- [x] Add rollback or forward-fix guidance for failed migrations.
- [x] Add backup and restore instructions for SQLite deployments.
- [x] Add migration tests against realistic old-to-new schema changes.

### Effect Execution

- [x] Define the runtime effect dispatcher interface.
- [x] Wire generated REST operations to dispatch returned effects.
- [x] Wire generated MCP operations to dispatch returned effects.
- [x] Add idempotency keys for effects triggered by operations.
- [x] Persist effect attempts and outcomes for retry and audit.
- [x] Implement webhook dispatch handler.
- [x] Implement email dispatch handler.
- [x] Implement payment intent or checkout creation handler.
- [x] Add retry policy, dead-letter handling, and operator visibility for failed effects.
- [x] Add tests proving operation state changes and effects stay consistent.

### Secrets And Configuration

- [x] Define required environment variables per generated app.
- [x] Validate required production environment variables at startup.
- [x] Refuse production startup with ephemeral registry keys unless explicitly allowed.
- [x] Keep API keys, registry private keys, payment keys, email credentials, and webhook signing secrets out of generated source.
- [x] Add `.env.example` per example app.
- [x] Document local, staging, and production configuration.

## P1 - Application-Grade Generated Outputs

These are needed for a credible first production deployment, even if P0 is enough for an internal pilot.

### Ontology Expressiveness

- [x] Add field metadata: label, help text, placeholder, format, enum values, display priority, privacy level, and redaction policy.
- [x] Add relationship metadata beyond raw foreign keys.
- [x] Add role and policy metadata for users, staff, services, and customer identities.
- [x] Add workflow metadata for operation groups, allowed transitions, audit text, and confirmation requirements.
- [x] Add validation metadata for min/max length, numeric ranges, regexes, enum values, and cross-field constraints.
- [x] Add derived field support for display-only values.
- [x] Add audit metadata for which entities and operations must be logged.
- [x] Add seed data support for reference data and example fixtures.

### Generated REST API

- [x] Generate typed request parsing and validation per endpoint.
- [x] Generate OpenAPI security schemes for API keys and certificate auth.
- [x] Generate OpenAPI request and response schemas for operation endpoints.
- [x] Generate proper response schemas for create, update, delete, and custom operations.
- [x] Add consistent `404`, `409`, `422`, and `500` response handling.
- [x] Add optimistic concurrency or updated-at checks where needed.
- [x] Add audit logging for writes and custom operations.
- [x] Add API versioning strategy.

### Generated MCP Server

- [x] Add MCP auth story for local stdio and HTTP transports.
- [x] Generate richer tool descriptions from ontology metadata.
- [x] Generate safer MCP tools that respect permissions and resource scopes.
- [x] Add tool input schemas with enum values, validation, and helpful descriptions.
- [x] Add pagination and filtering to list tools.
- [x] Add operation tools with confirmation metadata for destructive actions.
- [x] Add MCP integration tests that use generated examples, not only static codegen unit tests.

### Generated Web Client

- [x] Add login and identity challenge flow.
- [x] Add API key or certificate-aware fetch client.
- [x] Generate navigation from ontology metadata, not only entity names.
- [x] Generate list views with configured columns, filters, sorting, empty states, and pagination.
- [x] Generate detail views with related records and visible operation buttons.
- [x] Generate forms from field metadata, including enum controls, dates, times, money, textarea, and relationship selectors.
- [x] Add role-aware and permission-aware UI hiding and disabling.
- [x] Add end-user flows for the public ticketing example, not only admin CRUD.
- [x] Add internal workflow screens for the ticketing/issue-tracking example.
- [x] Add UI tests with browser automation for generated apps.
- [x] Make generated UI API base configurable instead of hard-coded to localhost.

### External Integrations

- [x] Choose first email provider and implement production OTP delivery.
- [x] Choose first payment provider and implement checkout or payment intent flow.
- [x] Add webhook signing and verification.
- [x] Add integration configuration metadata to Nix.
- [x] Add local fake providers for tests and development.
- [x] Add integration contract tests.

### Observability And Operations

- [ ] Add request IDs and correlation IDs to logs.
- [ ] Add structured audit log table for sensitive operations.
- [ ] Add metrics endpoint or documented log-based metrics.
- [ ] Add startup diagnostics that report config, migrations, and integration status.
- [ ] Add graceful shutdown handling.
- [ ] Add database vacuum/checkpoint/backup maintenance guidance.
- [ ] Add deployment examples for a single-server Bun + SQLite setup.
- [ ] Add restore drill instructions.

## P2 - Framework Quality And Scale

These make the framework easier to maintain and extend after the first production deployment.

### Codegen Architecture

- [ ] Split remaining large generator logic into focused modules.
- [ ] Add generator snapshot tests for REST, MCP, OpenAPI, services, SQL, and UI outputs.
- [ ] Add generated-example smoke tests that run the generated servers.
- [ ] Add linting and formatting commands.
- [ ] Add CI workflow for tests and generation checks.
- [x] Add codegen diagnostics with clear errors for invalid schemas.
- [x] Add schema validation before generation.

### Module System

- [ ] Define stable module authoring conventions.
- [ ] Add module README files with purpose, entities, operations, and dependencies.
- [ ] Add dependency declarations between modules.
- [ ] Add conflict detection for incompatible module combinations.
- [ ] Add reusable auth, audit, notification, and payment module patterns.
- [ ] Add a minimal blank project template.

### Documentation

- [ ] Document the ontology model end to end.
- [ ] Document how tables, columns, operations, guards, cascades, and effects compile.
- [ ] Document production deployment.
- [ ] Document identity and certificate auth.
- [ ] Document authorization policy authoring.
- [ ] Document migration workflow.
- [ ] Document integration handler authoring.
- [ ] Add a tutorial for creating a new bespoke app from scratch.
- [ ] Add a tutorial for adding a new reusable module.
- [ ] Add generated API and MCP examples for each example app.

### Example Applications

- [ ] Make Duchy Opera a complete public ticketing reference app.
- [ ] Make ticketing a complete internal workflow reference app.
- [ ] Add at least one non-ticketing B2C example to prove generality.
- [ ] Add fixtures and demo data for each example.
- [ ] Add deployment notes for each example.
- [ ] Add screenshots or generated UI walkthroughs for each example.

### Product Direction

- [ ] Decide whether OpenB2C remains Bun + SQLite only for production v1.
- [ ] Decide whether generated UI is intended for admin/back-office only or full end-user apps.
- [ ] Decide how much bespoke UI can be declared in Nix versus overridden in code.
- [ ] Decide whether MCP is generated as a first-class production API or primarily local/admin tooling.
- [ ] Define compatibility policy for schema modules and generated outputs.

## Suggested Milestones

### Milestone 1 - Honest Alpha

- [ ] Remove example-specific generator assumptions.
- [ ] Add app metadata to composition output.
- [ ] Fix auth initialization race.
- [ ] Add request body limits and JSON parsing errors.
- [ ] Update tests to regenerate both examples in CI.
- [ ] Document what is and is not safe in alpha.

### Milestone 2 - Secure Internal Pilot

- [ ] Implement auth context propagation.
- [ ] Implement resource authorization.
- [ ] Implement certificate revocation.
- [ ] Add migration history table and first migration workflow.
- [ ] Add generated-example REST and MCP integration tests.
- [ ] Add deployment docs for a single internal app.

### Milestone 3 - First Real Business Deployment

- [ ] Implement production email delivery.
- [ ] Implement payment or webhook integration needed by the chosen example.
- [ ] Add effect persistence, retries, and audit trail.
- [ ] Add backup and restore procedure.
- [ ] Add production environment validation.
- [ ] Run a full end-to-end flow through generated REST, MCP, and UI.

### Milestone 4 - General-Purpose Framework

- [ ] Expand ontology metadata enough to generate application-grade UI.
- [ ] Add module dependency and conflict handling.
- [ ] Add one non-ticketing example.
- [ ] Add complete module authoring docs.
- [ ] Add compatibility and upgrade policy.
