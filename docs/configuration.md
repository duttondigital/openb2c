# Configuration

Generated apps are configured through environment variables. Secrets must be supplied by the deployment environment, not committed into generated source.

The environment contract is derived from top-level Nix integration metadata. `integrations.identityEmail`, `integrations.emailEffects`, `integrations.payment`, `integrations.paymentWebhook`, and `integrations.webhookEffects` provide system defaults for provider names, required variables, secret classification, examples, and webhook signing headers. Application compositions normally do not need to restate this metadata unless they deliberately override a provider contract.

## Local

Use the example `.env.example` as a starting point:

```bash
cp examples/duchyopera/.env.example .env
NODE_ENV=development AUTH_ENABLED=false DB_PATH=./dev.db bun examples/duchyopera/generated/server.ts
```

Local development may use ephemeral registry keys and local fake providers. Missing `EMAIL_WEBHOOK_URL` or `WEBHOOK_URL` records fake email/webhook effect results instead of calling external services, and `PAYMENT_PROVIDER=local` or `PAYMENT_PROVIDER=fake` returns deterministic fake payment-intent shapes. Set `EMAIL_PROVIDER=fake` to capture identity OTP messages in the local fake outbox at `/ops/fake-emails`; non-production challenge responses still include the code for browser tests.
Identity OTP challenges return the code in non-production so generated UI and browser tests can complete without a real mailbox.

## Staging

Staging should mirror production safety settings:

- `NODE_ENV=production`
- Explicit `DB_PATH`
- Explicit `CORS_ORIGINS`
- `AUTH_ENABLED=true`
- `REGISTRY_PRIVATE_KEY` for local issuance or `REGISTRY_PUBLIC_KEY` for an external registry
- `RESEND_API_KEY` and `EMAIL_FROM` when the identity module is enabled
- Provider env vars for every declared email, webhook, or payment effect
- `ALLOW_FAKE_PROVIDERS=true` only in explicit production-like local tests that intentionally use `EMAIL_PROVIDER=fake` or `PAYMENT_PROVIDER=fake`

Use staging to test migrations, backups, restore drills, and failed effect retries before production.

## Production

Production startup fails when required env vars are missing. The generated server validates:

- Required app env vars derived from the ontology and declared effects.
- Auth is not disabled unless `ALLOW_INSECURE_AUTH_DISABLED=true`.
- CORS origins are explicit unless `ALLOW_WILDCARD_CORS=true`.
- Registry keys are configured unless `ALLOW_EPHEMERAL_REGISTRY_KEYS=true`.
- Identity OTP delivery is configured with the Resend provider when identity challenge tables are present.

Secrets such as `REGISTRY_PRIVATE_KEY`, `PAYMENT_API_KEY`, email provider credentials, and webhook endpoints must come from a secret store. Keep `.env` files out of source control.

The first production email provider is Resend. Generated identity challenge endpoints send OTP messages through `POST https://api.resend.com/emails` using `RESEND_API_KEY`, `EMAIL_FROM`, and an idempotency key derived from the challenge ID. `EMAIL_PROVIDER` defaults to `resend`; `RESEND_EMAILS_URL` exists only for tests or an internal proxy.

The first production payment provider is Stripe. Generated commerce payment-intent endpoints create Stripe PaymentIntents with `PAYMENT_PROVIDER=stripe`, `PAYMENT_API_KEY`, amount, lowercase currency, automatic payment methods, and an idempotency key derived from the generated order ID. `STRIPE_API_BASE` exists only for tests or an internal proxy.
Production startup rejects `EMAIL_PROVIDER=fake`, `PAYMENT_PROVIDER=fake`, and `PAYMENT_PROVIDER=local` unless `ALLOW_FAKE_PROVIDERS=true` is set for an explicit production-like test run.

Declared outbound webhook effects require `WEBHOOK_URL` and `WEBHOOK_SIGNING_SECRET` in production. Generated webhook dispatch signs the exact JSON request body with HMAC-SHA256 over `<timestamp>.<body>` and sends `X-OpenB2C-Timestamp` plus `X-OpenB2C-Signature: sha256=<hex>`. Receivers should reject missing, stale, or mismatched signatures; the generated verifier uses `WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` with a default of 300 seconds.

## Generated Templates

Codegen writes `.env.example` beside generated artifacts. These templates list required and optional variables, but secret values are intentionally blank.
OpenAPI also includes `x-openb2c-integrations` so generated clients and operators can inspect provider and environment metadata without exposing secret values.

Example projects also include:

- `examples/duchyopera/.env.example`
- `examples/ticketing/.env.example`
