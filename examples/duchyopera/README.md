# Duchy Opera

Cornish charity opera company ticketing platform built with OpenB2C.

## About

Duchy Opera demonstrates the OpenB2C framework with a complete ticketing system for a UK-based opera company.

## Modules Used

This example composes the following OpenB2C modules:

- **Customer** - Customer accounts with federated identity
- **Identity** - Ed25519-based authentication, no passwords
- **Venue** - Performance venues
- **Artist** - Performers and crew
- **Performance** - Shows with dates, times, and pricing
- **Ticket** - Ticket sales and lifecycle (booked → confirmed → used → cancelled)
- **Booking** - Checkout reservations, payment intent handoff, and stale checkout expiry
- **Transaction** - Payment processing and fulfillment
- **API Key** - Service authentication

## Setup

From the repository root:

```bash
# Generate code from this composition
compose examples/duchyopera/composition.nix
# or use the npm script:
bun run codegen:duchyopera

# Install dependencies
bun install

# Run tests
bun test

# Start REST server (port 3085)
bun dev

# Or generate + run in one command:
bun run dev:duchyopera
```

## Composition

This example's `composition.nix` directly imports the modules it needs from `schema/modules/`. To add or remove features, simply edit the imports in `composition.nix` and regenerate.

## Checkout Flow

Duchy Opera enables the generic ecommerce workflow in `composition.nix`. The configuration maps catalog items to performances, orders to bookings, line items to tickets, and settlement records to transactions.

1. `POST /commerce/checkout` creates a pending order from a configured cart.
2. `POST /commerce/orders/{id}/payment-intent` creates an idempotent payment intent for the order.
3. `POST /commerce/payments/webhook` receives a signed provider callback and confirms line items when payment succeeds.
4. `POST /commerce/orders/expire` cancels unpaid checkout reservations after their expiry window.

The original booking-oriented route names remain available as compatibility aliases, but the generated UI and MCP tools use the generic cart/order model.

Production deployments must configure `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, and `PAYMENT_WEBHOOK_SECRET`. The local provider remains available for tests and development.

## Design Principles

- **UK-focused**: GBP-only, UK postcodes, no internationalization
- **Accessible**: Multiple client support (web, mobile, AI assistants)
- **Privacy-first**: Federated identity, customers control their data
- **Low-cost**: Bun + SQLite, single server deployment

## Vision

Combat US tech oligopoly by restoring agency to smaller UK businesses. Rather than one-size-fits-all SaaS platforms, provide open-source tools businesses can own and customize.

Standardized backend (REST + MCP) enables true client choice:
- **Businesses** pick their own frontends, integrate with existing tools
- **Customers** use any client (web, native, AI assistant, accessibility tools)

Federated identity means customers verify once, authenticate everywhere. No passwords, no per-business accounts, no platform lock-in.
