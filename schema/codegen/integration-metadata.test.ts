import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { envVarSpecs, genEnvExample } from "./config";
import { genEffectsInterface } from "./effects";
import { genOpenAPI } from "./openapi";
import { genRoutes } from "./server";
import type { Operation, Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";
import { validateSchema } from "./validation";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

const baseColumn = {
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

async function loadExampleSchema(example: string): Promise<Schema> {
  const proc = Bun.spawn(["nix", "eval", "--json", "-f", join(PROJECT_ROOT, "examples", example, "composition.nix")], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) throw new Error(`nix eval failed for ${example}: ${stderr}`);
  return JSON.parse(stdout) as Schema;
}

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

function webhookSchema(base: Schema): Schema {
  return {
    organization: DEFAULT_ORGANIZATION_METADATA,
    integrations: {
      ...base.integrations!,
      webhookEffects: {
        ...base.integrations!.webhookEffects,
        signing: {
          ...base.integrations!.webhookEffects.signing,
          signatureHeader: "X-Demo-Signature",
          timestampHeader: "X-Demo-Timestamp",
          toleranceSeconds: 60,
        },
      },
    },
    tables: {
      ticket: {
        id: { ...baseColumn, type: "integer", pk: true, auto: true },
      },
    },
    operations: {
      ticket: {
        sync: operation({
          effects: [{ emit: null, notify: null, call: { service: "webhook", action: "sync_ticket" } }],
        }),
      },
    },
  };
}

describe("integration configuration metadata", () => {
  test("example compositions expose system integration metadata from Nix", async () => {
    const duchyOpera = await loadExampleSchema("duchyopera");

    expect(duchyOpera.integrations?.identityEmail.provider).toBe("resend");
    expect(duchyOpera.integrations?.payment.provider).toBe("stripe");
    expect(duchyOpera.integrations?.webhookEffects.signing).toMatchObject({
      enabled: true,
      algorithm: "sha256",
      payload: "timestamp.body",
      signatureHeader: "X-OpenB2C-Signature",
      timestampHeader: "X-OpenB2C-Timestamp",
      toleranceSeconds: 300,
    });

    const env = envVarSpecs(duchyOpera);
    expect(env.find(spec => spec.name === "RESEND_API_KEY")).toMatchObject({
      requiredInProduction: true,
      secret: true,
    });
    expect(env.find(spec => spec.name === "PAYMENT_WEBHOOK_SECRET")).toMatchObject({
      requiredInProduction: true,
      secret: true,
    });
    expect(env.find(spec => spec.name === "WEBHOOK_SIGNING_SECRET")).toBeUndefined();

    const example = genEnvExample(duchyOpera);
    expect(example).toContain("RESEND_API_KEY=");
    expect(example).toContain("PAYMENT_WEBHOOK_SECRET=");
    expect(example).not.toContain("WEBHOOK_SIGNING_SECRET=");

    const openapi = JSON.parse(genOpenAPI(duchyOpera));
    expect(openapi["x-openb2c-integrations"].payment.provider).toBe("stripe");
    expect(openapi["x-openb2c-integrations"].identityEmail.env.RESEND_API_KEY.secret).toBe(true);
  });

  test("generators consume webhook integration signing metadata", async () => {
    const duchyOpera = await loadExampleSchema("duchyopera");
    const schema = webhookSchema(duchyOpera);

    const env = envVarSpecs(schema);
    expect(env.find(spec => spec.name === "WEBHOOK_SIGNING_SECRET")).toMatchObject({
      requiredInProduction: true,
      secret: true,
    });

    const effects = genEffectsInterface(schema);
    expect(effects).toContain('const WEBHOOK_SIGNATURE_HEADER = "X-Demo-Signature";');
    expect(effects).toContain('const WEBHOOK_TIMESTAMP_HEADER = "X-Demo-Timestamp";');
    expect(effects).toContain("const DEFAULT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 60;");

    const server = genRoutes(schema);
    expect(server).toContain("X-Demo-Timestamp");
    expect(server).toContain("X-Demo-Signature");
  });

  test("validates malformed integration metadata", async () => {
    const duchyOpera = await loadExampleSchema("duchyopera");
    const schema = webhookSchema(duchyOpera);
    schema.integrations!.webhookEffects.signing.algorithm = "sha512";
    schema.integrations!.webhookEffects.signing.toleranceSeconds = 0;
    schema.integrations!.webhookEffects.env["bad-name"] = {
      description: "",
      requiredInProduction: true,
      secret: true,
    };

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      { path: "integrations.webhookEffects.signing.algorithm", message: "must be sha256" },
      { path: "integrations.webhookEffects.signing.toleranceSeconds", message: "must be at least 1" },
      { path: "integrations.webhookEffects.env.bad-name", message: "must be an uppercase environment variable name" },
      { path: "integrations.webhookEffects.env.bad-name.description", message: "is required" },
    ]));
  });
});
