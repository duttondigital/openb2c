import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { envVarSpecs, genEnvExample, requiredProductionEnvVars } from "./config";
import { genEffectsInterface } from "./effects";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Operation, Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const baseColumn = {
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    guard: null,
    relationships: [],
    public: false,
    scope: null,
    set: {},
    cascade: [],
    effects: [],
    ...overrides,
  };
}

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {
    ticket: {
      id: { ...baseColumn, type: "integer", pk: true, auto: true },
      status: { ...baseColumn, type: "text", default: "'reserved'" },
    },
  },
  operations: {
    ticket: {
      confirm: operation({
        set: { status: "confirmed" },
        effects: [
          { emit: null, notify: { channel: "email", template: "ticket_confirmation", to: "customer" }, call: null },
          { emit: null, notify: null, call: { service: "payment", action: "create_intent" } },
          { emit: null, notify: null, call: { service: "webhook", action: "sync_ticket" } },
        ],
      }),
    },
  },
};

const TEST_REGISTRY_PUBLIC_KEY = "b".repeat(64);

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-config-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

function clearEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.CORS_ORIGINS;
  delete process.env.REGISTRY_PUBLIC_KEY;
  delete process.env.EMAIL_WEBHOOK_URL;
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_API_KEY;
  delete process.env.WEBHOOK_URL;
}

describe("generated configuration", () => {
  test("derives required production environment variables from declared effects", () => {
    const required = requiredProductionEnvVars(schema);
    expect(required).toContain("DB_PATH");
    expect(required).toContain("CORS_ORIGINS");
    expect(required).toContain("EMAIL_WEBHOOK_URL");
    expect(required).toContain("PAYMENT_PROVIDER");
    expect(required).toContain("PAYMENT_API_KEY");
    expect(required).toContain("WEBHOOK_URL");

    const paymentKey = envVarSpecs(schema).find(spec => spec.name === "PAYMENT_API_KEY");
    expect(paymentKey?.secret).toBe(true);
  });

  test("env examples include keys without embedding secret values", () => {
    const example = genEnvExample(schema);
    expect(example).toContain("PAYMENT_API_KEY=");
    expect(example).toContain("REGISTRY_PRIVATE_KEY=");
    expect(example).toContain("EMAIL_WEBHOOK_URL=");
    expect(example).not.toContain("sk_");
    expect(example).not.toContain("test-payment-key");
  });

  test("production startup validates required app environment", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const dir = writeGenerated();

    try {
      process.env.DB_PATH = join(dir, "config.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.REGISTRY_PUBLIC_KEY = TEST_REGISTRY_PUBLIC_KEY;
      await expect(import(pathToFileURL(join(dir, "server.ts")).href)).rejects.toThrow("EMAIL_WEBHOOK_URL is required in production");

      clearEnv();
      const validDir = writeGenerated();
      process.env.DB_PATH = join(validDir, "config-valid.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.REGISTRY_PUBLIC_KEY = TEST_REGISTRY_PUBLIC_KEY;
      process.env.EMAIL_WEBHOOK_URL = "https://email.example/send";
      process.env.PAYMENT_PROVIDER = "stripe";
      process.env.PAYMENT_API_KEY = "test-payment-key";
      process.env.WEBHOOK_URL = "https://hooks.example/openb2c";
      const { server } = await import(pathToFileURL(join(validDir, "server.ts")).href);
      server.stop(true);
    } finally {
      clearEnv();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
