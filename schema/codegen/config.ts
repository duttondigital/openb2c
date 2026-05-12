import type { IntegrationMetadata, IntegrationsConfig, Schema, WebhookIntegrationMetadata } from "./types";
import { hasSeedRows } from "./seed";
import { hasCommerceWorkflow } from "./utils";

export interface EnvVarSpec {
  name: string;
  description: string;
  requiredInProduction: boolean;
  secret: boolean;
  example?: string;
}

function hasEmailEffects(schema: Schema): boolean {
  return Object.values(schema.operations).some(ops =>
    Object.values(ops).some(op =>
      op.effects.some(effect => effect.notify?.channel === "email")
    )
  );
}

function hasWebhookEffects(schema: Schema): boolean {
  return Object.values(schema.operations).some(ops =>
    Object.values(ops).some(op =>
      op.effects.some(effect => effect.call?.service === "webhook")
    )
  );
}

function hasPaymentEffects(schema: Schema): boolean {
  return Object.values(schema.operations).some(ops =>
    Object.values(ops).some(op =>
      op.effects.some(effect => effect.call?.service === "payment")
    )
  );
}

function hasIdentityChallenge(schema: Schema): boolean {
  return Boolean(schema.tables.identity_challenge && schema.tables.identity_registry);
}

const FALLBACK_INTEGRATIONS: IntegrationsConfig = {
  identityEmail: {
    provider: "resend",
    description: "Production identity OTP email delivery.",
    env: {
      EMAIL_PROVIDER: { description: "Email provider used for identity OTP delivery. Use resend for production or fake for local provider tests.", requiredInProduction: false, secret: false, example: "resend" },
      RESEND_API_KEY: { description: "Resend API key used to send production identity OTP emails.", requiredInProduction: true, secret: true },
      EMAIL_FROM: { description: "Verified sender address for production identity OTP emails.", requiredInProduction: true, secret: false, example: "OpenB2C <login@example.com>" },
      IDENTITY_OTP_SUBJECT: { description: "Optional subject line override for identity OTP emails.", requiredInProduction: false, secret: false },
      RESEND_EMAILS_URL: { description: "Optional Resend emails API endpoint override for tests or proxies.", requiredInProduction: false, secret: false, example: "https://api.resend.com/emails" },
    },
  },
  emailEffects: {
    provider: "webhook",
    description: "Generated email effect dispatch endpoint.",
    env: {
      EMAIL_WEBHOOK_URL: { description: "Email provider dispatch endpoint used by generated email effects.", requiredInProduction: true, secret: true },
    },
  },
  payment: {
    provider: "stripe",
    description: "Generated payment-intent provider.",
    env: {
      PAYMENT_PROVIDER: { description: "Payment provider identifier. Use stripe for production or local/fake for development.", requiredInProduction: true, secret: false, example: "stripe" },
      PAYMENT_API_KEY: { description: "Payment provider API key. For Stripe, use a Stripe secret key.", requiredInProduction: true, secret: true },
      STRIPE_API_BASE: { description: "Optional Stripe API endpoint override for tests or proxies.", requiredInProduction: false, secret: false, example: "https://api.stripe.com" },
    },
  },
  paymentWebhook: {
    provider: "openb2c",
    description: "Inbound payment provider webhook verification.",
    env: {
      PAYMENT_WEBHOOK_SECRET: { description: "Shared secret used to verify payment provider webhook signatures.", requiredInProduction: true, secret: true },
    },
  },
  webhookEffects: {
    provider: "openb2c",
    description: "Generated outbound webhook effect dispatch.",
    env: {
      WEBHOOK_URL: { description: "Webhook dispatch endpoint used by generated webhook effects.", requiredInProduction: true, secret: true },
      WEBHOOK_SIGNING_SECRET: { description: "Shared secret used to sign outbound OpenB2C webhook effects.", requiredInProduction: true, secret: true },
      WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: { description: "Maximum accepted age for OpenB2C webhook signatures when using the generated verifier.", requiredInProduction: false, secret: false, example: "300" },
    },
    signing: {
      enabled: true,
      algorithm: "sha256",
      payload: "timestamp.body",
      signatureHeader: "X-OpenB2C-Signature",
      timestampHeader: "X-OpenB2C-Timestamp",
      toleranceSeconds: 300,
    },
  },
};

function integration(schema: Schema, key: keyof IntegrationsConfig): IntegrationMetadata | WebhookIntegrationMetadata {
  return schema.integrations?.[key] || FALLBACK_INTEGRATIONS[key];
}

function integrationEnvSpecs(schema: Schema, key: keyof IntegrationsConfig): EnvVarSpec[] {
  return Object.entries(integration(schema, key).env || {}).map(([name, spec]) => ({
    name,
    description: spec.description,
    requiredInProduction: spec.requiredInProduction,
    secret: spec.secret,
    example: spec.example ?? undefined,
  }));
}

export function envVarSpecs(schema: Schema): EnvVarSpec[] {
  const specs: EnvVarSpec[] = [
    { name: "NODE_ENV", description: "Set to production for production startup validation.", requiredInProduction: false, secret: false, example: "development" },
    { name: "DB_PATH", description: "SQLite database path.", requiredInProduction: true, secret: false, example: "./data/app.db" },
    { name: "PORT", description: "REST API port.", requiredInProduction: false, secret: false },
    { name: "MCP_PORT", description: "MCP HTTP transport port.", requiredInProduction: false, secret: false },
    { name: "AUTH_ENABLED", description: "Authentication toggle. Defaults to true.", requiredInProduction: false, secret: false, example: "true" },
    { name: "CORS_ORIGINS", description: "Comma-separated browser origins allowed to call the API.", requiredInProduction: true, secret: false, example: "https://app.example.com" },
    { name: "REGISTRY_PRIVATE_KEY", description: "Hex-encoded Ed25519 private key for local certificate issuance.", requiredInProduction: false, secret: true },
    { name: "REGISTRY_PUBLIC_KEY", description: "Hex-encoded Ed25519 public key for external certificate registry verification.", requiredInProduction: false, secret: false },
    { name: "ALLOW_EPHEMERAL_REGISTRY_KEYS", description: "Explicitly allow ephemeral registry keys in production.", requiredInProduction: false, secret: false, example: "false" },
    { name: "ALLOW_FAKE_PROVIDERS", description: "Explicitly allow local fake providers in production-like tests.", requiredInProduction: false, secret: false, example: "false" },
    { name: "MAX_REQUEST_BODY_BYTES", description: "Maximum JSON request body size.", requiredInProduction: false, secret: false },
    { name: "MAX_PAGE_LIMIT", description: "Maximum generated list endpoint page size.", requiredInProduction: false, secret: false },
    { name: "ROUTE_TIMEOUT_MS", description: "Per-route timeout in milliseconds.", requiredInProduction: false, secret: false },
    { name: "EFFECT_MAX_ATTEMPTS", description: "Maximum effect dispatch attempts before dead-lettering.", requiredInProduction: false, secret: false },
    { name: "EFFECT_RETRY_DELAY_MS", description: "Base effect retry delay in milliseconds.", requiredInProduction: false, secret: false },
  ];

  if (hasEmailEffects(schema)) {
    specs.push(...integrationEnvSpecs(schema, "emailEffects"));
  }
  if (hasIdentityChallenge(schema)) {
    specs.push(...integrationEnvSpecs(schema, "identityEmail"));
  }
  if (hasWebhookEffects(schema)) {
    specs.push(...integrationEnvSpecs(schema, "webhookEffects"));
  }
  if (hasPaymentEffects(schema) || hasCommerceWorkflow(schema)) {
    specs.push(...integrationEnvSpecs(schema, "payment"));
  }
  if (hasCommerceWorkflow(schema)) {
    specs.push(...integrationEnvSpecs(schema, "paymentWebhook"));
  }
  if (hasSeedRows(schema, "fixtures")) {
    specs.push({ name: "OPENB2C_APPLY_FIXTURES", description: "Apply generated fixture seed data at startup. Set false to disable non-production defaults.", requiredInProduction: false, secret: false, example: "false" });
  }

  return specs;
}

export function requiredProductionEnvVars(schema: Schema): string[] {
  return envVarSpecs(schema)
    .filter(spec => spec.requiredInProduction)
    .map(spec => spec.name)
    .sort();
}

export function genEnvExample(schema: Schema): string {
  const lines = [
    "# Generated OpenB2C environment template",
    "# Fill values in deployment secrets; do not commit real secret values.",
    "",
  ];
  for (const spec of envVarSpecs(schema)) {
    lines.push(`# ${spec.description}`);
    if (spec.requiredInProduction) lines.push("# Required in production.");
    if (spec.secret) lines.push("# Secret: provide through your deployment secret store.");
    lines.push(`${spec.name}=${spec.secret ? "" : spec.example ?? ""}`, "");
  }
  return lines.join("\n");
}
