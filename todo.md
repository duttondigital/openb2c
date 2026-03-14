# Roadmap

## Done
- [x] Nix schema definitions (customer, venue, artist, performance, ticket, transaction)
- [x] Codegen: SQL, types, services, effects
- [x] Codegen: REST server, MCP server
- [x] Codegen: integration tests (HTTP + MCP)
- [x] Business logic: guards, cascades, effects (declared)
- [x] Input validation (email, postcode, phone, date, time)
- [x] Pagination (limit/offset on list endpoints)
- [x] Filtering (query params map to WHERE clauses)
- [x] Sorting (sort/order query params)
- [x] Health check endpoint (/health)
- [x] Structured JSON logging
- [x] OpenAPI spec generation (openapi.json)
- [x] Consistent error responses (error, code, details)
- [x] API key auth (Bearer token, scopes, for services)
- [x] Schema dependency ordering (topological sort for FKs)
- [x] Federated identity (Ed25519 keypair + email verification)
- [x] Certificate-based auth (registry signs, any business verifies)

## Security (Critical)
- [x] Hide OTP in production (NODE_ENV=production excludes code from response)
- [x] Exclude API key secrets from REST responses (key_hash filtered via REDACTED_FIELDS)
- [x] Hash API keys (bcrypt via Bun.password, key_prefix for identification)

## Security (High)
- [ ] Enforce certificate revocation (check `identity_registry.revoked` in verifyRequest)
- [ ] Resource authorization (customers can only access their own tickets/transactions)
- [ ] Rate limiting on identity endpoints (prevent challenge spam)

## Identity
- [x] Auto-create customer on first authenticated request (ensureCustomer)

## Technical Debt
- [ ] Unique constraints on junction tables (performance_artist, transaction_ticket)
- [ ] Fix async init race (await initRegistryKeys before serving requests)
- [ ] Request body size limits (prevent DoS via large JSON)
- [ ] Schema indexes (declare in Nix, generate CREATE INDEX)
- [ ] Migration system (evolve schema without data loss)
- [ ] Split codegen.ts into smaller modules

## Requires External Integration
- [ ] Payment (Stripe)
- [ ] Email sending (for OTP delivery in production)
- [ ] Webhook dispatch (effect handlers)

## Future
- [ ] Admin UI
- [ ] Reporting / analytics
- [ ] Seat maps / venue layouts
- [ ] Waitlist / queue management
- [ ] Promo codes / discounts
