import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
import { genRuntime } from "./runtime";
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
          { emit: "ticket.confirmed", notify: null, call: null },
          { emit: null, notify: { channel: "email", template: "ticket_confirmation", to: "customer" }, call: null },
          { emit: null, notify: null, call: { service: "payment", action: "create_intent" } },
        ],
      }),
    },
  },
};

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-effects-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  writeFileSync(join(dir, "mcp.ts"), genMcpServer(schema));
  return dir;
}

function seedTicket(dbPath: string, id = 1) {
  const db = new Database(dbPath);
  for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) db.run(stmt);
  db.query("INSERT INTO ticket (id, status) VALUES (?, ?)").run(id, "reserved");
  db.close();
}

function effectRows(dbPath: string): { status: string; idempotency_key: string; context_json: string; attempts: number; next_attempt_at: string | null; effect_type: string; result_json: string | null }[] {
  const db = new Database(dbPath);
  const rows = db.query(`
    SELECT status, idempotency_key, context_json, attempts, next_attempt_at, effect_type, result_json
    FROM openb2c_effect_attempt
    ORDER BY id
  `).all() as { status: string; idempotency_key: string; context_json: string; attempts: number; next_attempt_at: string | null; effect_type: string; result_json: string | null }[];
  db.close();
  return rows;
}

function hex(bytes: ArrayBuffer): string {
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
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

describe("generated effect execution", () => {
  test("REST operations dispatch persisted idempotent effects and expose operator visibility", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "rest.sqlite");
    seedTicket(dbPath);
    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const response = await fetch(`${base}/api/tickets/1/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": "confirm-ticket-1" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: 1, status: "confirmed" });

      const db = new Database(dbPath);
      const ticket = db.query<{ status: string }, []>("SELECT status FROM ticket WHERE id = 1").get();
      db.close();
      expect(ticket?.status).toBe("confirmed");

      const rows = effectRows(dbPath);
      expect(rows).toHaveLength(3);
      expect(rows.every(row => row.status === "succeeded")).toBe(true);
      expect(rows.every(row => row.idempotency_key.startsWith("confirm-ticket-1:"))).toBe(true);
      const payment = rows.find(row => row.effect_type === "call");
      expect(payment?.result_json).toContain("\"provider\":\"local\"");
      expect(payment?.result_json).toContain("\"action\":\"create_intent\"");

      const visibility = await fetch(`${base}/ops/effects`);
      expect(visibility.status).toBe(200);
      const body = await visibility.json() as { items: unknown[] };
      expect(body.items).toHaveLength(3);
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
    }
  });

  test("MCP operations dispatch the same persisted effects", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "mcp.sqlite");
    seedTicket(dbPath);
    process.env.DB_PATH = dbPath;
    const { callTool } = await import(pathToFileURL(join(dir, "mcp.ts")).href);

    try {
      const result = await callTool("confirm_ticket", { id: 1 });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual({ id: 1, status: "confirmed" });

      const rows = effectRows(dbPath);
      expect(rows).toHaveLength(3);
      expect(rows.every(row => JSON.parse(row.context_json).source === "mcp")).toBe(true);
    } finally {
      delete process.env.DB_PATH;
    }
  });

  test("effect retries persist failures and dead-letter exhausted attempts", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "retry.sqlite");
    seedTicket(dbPath);
    const effects = await import(pathToFileURL(join(dir, "effects.ts")).href);
    const db = new Database(dbPath);
    const handlers = {
      ...effects.defaultEffectHandlers,
      email: async () => {
        throw new Error("smtp down");
      },
    };
    const notify = [{
      type: "notify",
      payload: { channel: "email", template: "ticket_confirmation", to: "customer" },
    }];

    try {
      const first = await effects.dispatchEffects(db, notify, {
        source: "rest",
        operation: "ticket.confirm",
        entity: "ticket",
        recordId: 1,
        maxAttempts: 2,
      }, handlers);
      expect(first.failed).toBe(1);
      let row = effects.listEffectAttempts(db)[0];
      expect(row.status).toBe("failed");
      expect(row.attempts).toBe(1);
      expect(row.next_attempt_at).toBeTruthy();

      const retry = await effects.retryFailedEffects(db, handlers);
      expect(retry.deadLetter).toBe(1);
      row = effects.listEffectAttempts(db)[0];
      expect(row.status).toBe("dead_letter");
      expect(row.attempts).toBe(2);
      expect(row.last_error).toContain("smtp down");
    } finally {
      db.close();
    }
  });

  test("default webhook handler posts configured webhook effects", async () => {
    const dir = writeGenerated();
    const effects = await import(pathToFileURL(join(dir, "effects.ts")).href);
    const db = new Database(join(dir, "webhook.sqlite"));
    const received: Array<{ headers: Record<string, string>; body: string; json: unknown; valid: boolean }> = [];
    const hook = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = await req.text();
        const headers = Object.fromEntries(req.headers);
        received.push({
          headers,
          body,
          json: JSON.parse(body),
          valid: await effects.verifyOpenB2CWebhookSignature(req.headers, body, "test-webhook-secret"),
        });
        return Response.json({ ok: true });
      },
    });
    process.env.WEBHOOK_URL = `http://127.0.0.1:${hook.port}`;
    process.env.WEBHOOK_SIGNING_SECRET = "test-webhook-secret";

    try {
      const summary = await effects.dispatchEffects(db, [{
        type: "call",
        payload: { service: "webhook", action: "sync_ticket" },
      }], {
        source: "rest",
        operation: "ticket.confirm",
        entity: "ticket",
        recordId: 1,
      });

      expect(summary.succeeded).toBe(1);
      expect(received).toHaveLength(1);
      expect(received[0].json).toMatchObject({ action: "sync_ticket" });
      expect(received[0].valid).toBe(true);
      const timestamp = received[0].headers["x-openb2c-timestamp"];
      expect(timestamp).toMatch(/^\d+$/);
      expect(received[0].headers["x-openb2c-signature"]).toBe(
        `sha256=${await hmacSha256Hex("test-webhook-secret", `${timestamp}.${received[0].body}`)}`
      );
      expect(await effects.verifyOpenB2CWebhookSignature(
        new Headers(received[0].headers),
        received[0].body.replace("sync_ticket", "tampered"),
        "test-webhook-secret",
      )).toBe(false);
    } finally {
      hook.stop(true);
      db.close();
      delete process.env.WEBHOOK_URL;
      delete process.env.WEBHOOK_SIGNING_SECRET;
    }
  });

  test("default handlers provide local fake providers without external endpoints", async () => {
    const dir = writeGenerated();
    const effects = await import(pathToFileURL(join(dir, "effects.ts")).href);
    const db = new Database(join(dir, "fake-providers.sqlite"));
    delete process.env.EMAIL_WEBHOOK_URL;
    delete process.env.WEBHOOK_URL;
    process.env.PAYMENT_PROVIDER = "fake";

    try {
      const summary = await effects.dispatchEffects(db, [
        { type: "notify", payload: { channel: "email", template: "ticket_confirmation", to: "customer" } },
        { type: "call", payload: { service: "webhook", action: "sync_ticket" } },
        { type: "call", payload: { service: "payment", action: "create_intent" } },
      ], {
        source: "rest",
        operation: "ticket.confirm",
        entity: "ticket",
        recordId: 1,
      });

      expect(summary).toMatchObject({ attempted: 3, succeeded: 3, failed: 0 });
      const rows = effects.listEffectAttempts(db);
      expect(rows).toHaveLength(3);
      expect(rows.map((row: { result_json: string }) => JSON.parse(row.result_json).provider)).toEqual(["fake", "fake", "fake"]);
    } finally {
      db.close();
      delete process.env.PAYMENT_PROVIDER;
    }
  });
});
