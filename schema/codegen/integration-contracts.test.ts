import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { genRuntime } from "./runtime";
import type { Operation, Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

const baseColumn = {
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

async function nixEvalJson(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["nix", "eval", "--impure", "--json", ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function loadDuchyOperaSchema(): Promise<Schema> {
  const result = await nixEvalJson(["-f", join(PROJECT_ROOT, "examples", "duchyopera", "composition.nix")]);
  if (result.exitCode !== 0) throw new Error(`nix eval failed for duchyopera: ${result.stderr}`);
  return JSON.parse(result.stdout) as Schema;
}

function writeGenerated(schema: Schema, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables, schema.indexes));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

function applySql(db: Database, schema: Schema) {
  for (const stmt of genSQL(schema.tables, schema.indexes).split(/;\s*\n/).filter(s => s.trim())) db.run(stmt);
}

function seedDuchyOpera(dbPath: string) {
  const db = new Database(dbPath);
  try {
    db.query("INSERT INTO user (id, email, name) VALUES (1, 'ada@example.test', 'Ada Lovelace')").run();
    db.query("INSERT INTO venue (id, name, address, city, postcode, capacity) VALUES (1, 'Hall for Cornwall', 'Back Quay', 'Truro', 'TR1 2LL', 900)").run();
    db.query("INSERT INTO production (id, name, season, status) VALUES (1, 'The Magic Flute', 'Summer 2026', 'active')").run();
    db.query("INSERT INTO performance (id, production_id, venue_id, starts_at, ends_at, price_pence, status) VALUES (1, 1, 1, '2026-06-27T19:30:00Z', '2026-06-27T22:00:00Z', 2500, 'scheduled')").run();
  } finally {
    db.close();
  }
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

function webhookContractSchema(): Schema {
  return {
    organization: DEFAULT_ORGANIZATION_METADATA,
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

function clearEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.AUTH_ENABLED;
  delete process.env.CORS_ORIGINS;
  delete process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS;
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_API_KEY;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.STRIPE_API_BASE;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_WEBHOOK_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_EMAILS_URL;
  delete process.env.EMAIL_FROM;
  delete process.env.WEBHOOK_URL;
  delete process.env.WEBHOOK_SIGNING_SECRET;
  delete process.env.NODE_ENV;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

describe("integration provider contracts", () => {
  test("Resend identity OTP delivery contract", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const schema = await loadDuchyOperaSchema();
    const dir = writeGenerated(schema, "openb2c-contract-resend-");
    const deliveries: Array<{ path: string; headers: Record<string, string>; body: any }> = [];
    const resend = Bun.serve({
      port: 0,
      async fetch(req) {
        deliveries.push({
          path: new URL(req.url).pathname,
          headers: Object.fromEntries(req.headers),
          body: await req.json(),
        });
        return Response.json({ id: "email_contract_123" });
      },
    });
    let server: Bun.Server | null = null;

    try {
      process.env.NODE_ENV = "production";
      process.env.DB_PATH = join(dir, "resend-contract.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS = "true";
      process.env.EMAIL_WEBHOOK_URL = "https://email.example/send";
      process.env.PAYMENT_PROVIDER = "stripe";
      process.env.PAYMENT_API_KEY = "sk_test_unused";
      process.env.PAYMENT_WEBHOOK_SECRET = "unused-payment-webhook-secret";
      process.env.RESEND_API_KEY = "re_contract";
      process.env.RESEND_EMAILS_URL = `http://127.0.0.1:${resend.port}/emails`;
      process.env.EMAIL_FROM = "OpenB2C <login@example.test>";

      ({ server } = await import(`${pathToFileURL(join(dir, "server.ts")).href}?resend-contract=${Date.now()}`));
      const base = `http://127.0.0.1:${server.port}`;
      const keypair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
      const publicKey = bytesToHex(await crypto.subtle.exportKey("raw", keypair.publicKey));

      const challenge = await fetch(`${base}/identity/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "contract@example.test", publicKey }),
      });
      expect(challenge.status).toBe(200);
      const challengeBody = await challenge.json() as { challengeId: number; code?: string };
      expect(challengeBody.code).toBeUndefined();

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].path).toBe("/emails");
      expect(deliveries[0].headers.authorization).toBe("Bearer re_contract");
      expect(deliveries[0].headers["idempotency-key"]).toBe(`identity-challenge-${challengeBody.challengeId}`);
      expect(deliveries[0].body).toMatchObject({
        from: "OpenB2C <login@example.test>",
        to: ["contract@example.test"],
        subject: "Duchy Opera sign-in code",
        tags: [
          { name: "openb2c_event", value: "identity_otp" },
          { name: "openb2c_app", value: "duchy-opera" },
        ],
      });
      expect(String(deliveries[0].body.text)).toContain("Duchy Opera sign-in code");
      expect(String(deliveries[0].body.html)).toContain("Your sign-in code for Duchy Opera is:");
    } finally {
      server?.stop(true);
      resend.stop(true);
      clearEnv();
      if (previousNodeEnv !== undefined) process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("Stripe PaymentIntent create and retrieve contract", async () => {
    const schema = await loadDuchyOperaSchema();
    const dir = writeGenerated(schema, "openb2c-contract-stripe-");
    const dbPath = join(dir, "stripe-contract.sqlite");
    const db = new Database(dbPath);
    applySql(db, schema);
    db.close();
    seedDuchyOpera(dbPath);

    const stripeRequests: Array<{ method: string; path: string; headers: Record<string, string>; body: string }> = [];
    const stripe = Bun.serve({
      port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname;
        const body = await req.text();
        stripeRequests.push({ method: req.method, path, headers: Object.fromEntries(req.headers), body });
        if (req.method === "POST" && path === "/v1/payment_intents") {
          return Response.json({ id: "pi_contract_123", client_secret: "pi_contract_123_secret_abc" });
        }
        if (req.method === "GET" && path === "/v1/payment_intents/pi_contract_123") {
          return Response.json({ id: "pi_contract_123", client_secret: "pi_contract_123_secret_abc" });
        }
        return Response.json({ error: "unexpected" }, { status: 404 });
      },
    });
    let server: Bun.Server | null = null;

    try {
      process.env.DB_PATH = dbPath;
      process.env.PORT = "0";
      process.env.AUTH_ENABLED = "false";
      process.env.PAYMENT_PROVIDER = "stripe";
      process.env.PAYMENT_API_KEY = "sk_test_contract";
      process.env.PAYMENT_WEBHOOK_SECRET = "contract-webhook-secret";
      process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripe.port}`;

      ({ server } = await import(`${pathToFileURL(join(dir, "server.ts")).href}?stripe-contract=${Date.now()}`));
      const base = `http://127.0.0.1:${server.port}`;

      const checkout = await fetch(`${base}/commerce/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: 1, items: [{ item_id: 1, quantity: 2 }] }),
      });
      expect(checkout.status).toBe(201);
      const checkedOut = await checkout.json() as { order_id: number };

      const intent = await fetch(`${base}/commerce/orders/${checkedOut.order_id}/payment-intent`, { method: "POST" });
      expect(intent.status).toBe(201);
      expect(await intent.json()).toMatchObject({
        provider: "stripe",
        reference: "pi_contract_123",
        client_secret: "pi_contract_123_secret_abc",
      });

      const repeated = await fetch(`${base}/commerce/orders/${checkedOut.order_id}/payment-intent`, { method: "POST" });
      expect(repeated.status).toBe(201);

      expect(stripeRequests).toHaveLength(2);
      const create = stripeRequests[0];
      expect(create).toMatchObject({ method: "POST", path: "/v1/payment_intents" });
      expect(create.headers.authorization).toBe("Bearer sk_test_contract");
      expect(create.headers["content-type"]).toContain("application/x-www-form-urlencoded");
      expect(create.headers["idempotency-key"]).toBe(`openb2c-commerce-order-${checkedOut.order_id}`);
      const body = new URLSearchParams(create.body);
      expect(body.get("amount")).toBe("5000");
      expect(body.get("currency")).toBe("gbp");
      expect(body.get("automatic_payment_methods[enabled]")).toBe("true");
      expect(body.get("metadata[openb2c_order_id]")).toBe(String(checkedOut.order_id));

      expect(stripeRequests[1]).toMatchObject({
        method: "GET",
        path: "/v1/payment_intents/pi_contract_123",
      });
      expect(stripeRequests[1].headers.authorization).toBe("Bearer sk_test_contract");
    } finally {
      server?.stop(true);
      stripe.stop(true);
      clearEnv();
    }
  });

  test("signed outbound webhook effect contract", async () => {
    const schema = webhookContractSchema();
    const dir = writeGenerated(schema, "openb2c-contract-webhook-");
    const effects = await import(`${pathToFileURL(join(dir, "effects.ts")).href}?webhook-contract=${Date.now()}`);
    const db = new Database(join(dir, "webhook-contract.sqlite"));
    const received: Array<{ headers: Record<string, string>; body: string }> = [];
    const webhook = Bun.serve({
      port: 0,
      async fetch(req) {
        received.push({
          headers: Object.fromEntries(req.headers),
          body: await req.text(),
        });
        return Response.json({ ok: true });
      },
    });

    try {
      process.env.WEBHOOK_URL = `http://127.0.0.1:${webhook.port}`;
      process.env.WEBHOOK_SIGNING_SECRET = "contract-webhook-secret";
      const summary = await effects.dispatchEffects(db, [{
        type: "call",
        payload: { service: "webhook", action: "sync_ticket" },
      }], {
        source: "rest",
        operation: "ticket.sync",
        entity: "ticket",
        recordId: 1,
      });
      expect(summary.succeeded).toBe(1);
      expect(received).toHaveLength(1);
      const timestamp = received[0].headers["x-openb2c-timestamp"];
      const signature = received[0].headers["x-openb2c-signature"];
      expect(signature).toBe(`sha256=${await hmacSha256Hex("contract-webhook-secret", `${timestamp}.${received[0].body}`)}`);
      expect(await effects.verifyOpenB2CWebhookSignature(
        new Headers(received[0].headers),
        received[0].body,
        "contract-webhook-secret",
      )).toBe(true);
      expect(await effects.verifyOpenB2CWebhookSignature(
        new Headers(received[0].headers),
        received[0].body.replace("sync_ticket", "tampered"),
        "contract-webhook-secret",
      )).toBe(false);
    } finally {
      webhook.stop(true);
      db.close();
      clearEnv();
    }
  });
});
