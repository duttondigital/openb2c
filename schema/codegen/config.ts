import type { Schema } from "./types";
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
    { name: "MAX_REQUEST_BODY_BYTES", description: "Maximum JSON request body size.", requiredInProduction: false, secret: false },
    { name: "MAX_PAGE_LIMIT", description: "Maximum generated list endpoint page size.", requiredInProduction: false, secret: false },
    { name: "ROUTE_TIMEOUT_MS", description: "Per-route timeout in milliseconds.", requiredInProduction: false, secret: false },
    { name: "EFFECT_MAX_ATTEMPTS", description: "Maximum effect dispatch attempts before dead-lettering.", requiredInProduction: false, secret: false },
    { name: "EFFECT_RETRY_DELAY_MS", description: "Base effect retry delay in milliseconds.", requiredInProduction: false, secret: false },
  ];

  if (hasEmailEffects(schema)) {
    specs.push({ name: "EMAIL_WEBHOOK_URL", description: "Email provider dispatch endpoint used by generated email effects.", requiredInProduction: true, secret: true });
  }
  if (hasWebhookEffects(schema)) {
    specs.push({ name: "WEBHOOK_URL", description: "Webhook dispatch endpoint used by generated webhook effects.", requiredInProduction: true, secret: true });
  }
  if (hasPaymentEffects(schema) || hasCommerceWorkflow(schema)) {
    specs.push(
      { name: "PAYMENT_PROVIDER", description: "Payment provider identifier.", requiredInProduction: true, secret: false, example: "stripe" },
      { name: "PAYMENT_API_KEY", description: "Payment provider API key.", requiredInProduction: true, secret: true }
    );
  }
  if (hasCommerceWorkflow(schema)) {
    specs.push({ name: "PAYMENT_WEBHOOK_SECRET", description: "Shared secret used to verify payment provider webhook signatures.", requiredInProduction: true, secret: true });
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
