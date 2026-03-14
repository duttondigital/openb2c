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
