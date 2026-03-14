# Roadmap

## Done
- [x] Nix schema definitions (customer, venue, artist, performance, ticket, transaction)
- [x] Codegen: SQL, types, services, effects
- [x] Codegen: REST server, MCP server
- [x] Codegen: integration tests (HTTP + MCP)
- [x] Business logic: guards, cascades, effects (declared)
- [x] Input validation (email, postcode, phone, date, time)
- [x] Pagination (limit/offset on list endpoints)
- [x] Health check endpoint (/health)
- [x] Structured JSON logging

## No External Dependencies
- [ ] Filtering/sorting (query params)
- [ ] OpenAPI spec generation
- [ ] Error codes (consistent error response schema)

## Requires External Integration
- [ ] Auth (API keys / sessions)
- [ ] Payment (Stripe)
- [ ] Email notifications (SendGrid / Resend)
- [ ] Webhook dispatch (effect handlers)

## Future
- [ ] Admin UI
- [ ] Reporting / analytics
- [ ] Seat maps / venue layouts
- [ ] Waitlist / queue management
- [ ] Promo codes / discounts
