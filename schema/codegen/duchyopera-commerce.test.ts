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
import type { Schema } from "./types";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

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
  if (result.exitCode !== 0) {
    throw new Error(`nix eval failed for duchyopera: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Schema;
}

function writeGenerated(schema: Schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-duchy-commerce-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables, schema.indexes));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

function seedDuchyOpera(dbPath: string) {
  const db = new Database(dbPath);
  try {
    db.query("INSERT INTO user (id, email, name) VALUES (1, 'ada@example.test', 'Ada Lovelace')").run();
    db.query("INSERT INTO venue (id, name, address, city, postcode, capacity) VALUES (1, 'Hall for Cornwall', 'Back Quay', 'Truro', 'TR1 2LL', 900)").run();
    db.query("INSERT INTO performance (id, title, venue_id, date, time, duration_mins, price_pence, status) VALUES (1, 'The Magic Flute', 1, '2026-06-12', '19:30', 150, 2500, 'scheduled')").run();
  } finally {
    db.close();
  }
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function clearEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.AUTH_ENABLED;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
}

describe("Duchy Opera commerce workflow", () => {
  test("reserves tickets, creates a payment intent, confirms paid bookings, and expires stale checkouts", async () => {
    const schema = await loadDuchyOperaSchema();
    const dir = writeGenerated(schema);
    const dbPath = join(dir, "duchy-commerce.sqlite");
    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";

    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;
    seedDuchyOpera(dbPath);

    try {
      const reserve = await fetch(`${base}/commerce/bookings/reserve`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "reserve-opera-1" },
        body: JSON.stringify({
          user_id: 1,
          performance_id: 1,
          quantity: 2,
          price_pence: 1,
          ticket_type: "standard",
          client: "web",
        }),
      });
      expect(reserve.status).toBe(201);
      const reserved = await reserve.json() as { booking_id: number; ticket_ids: number[]; amount_pence: number; status: string };
      expect(reserved.ticket_ids).toHaveLength(2);
      expect(reserved.amount_pence).toBe(5000);
      expect(reserved.status).toBe("checkout_pending");

      const intent = await fetch(`${base}/commerce/bookings/${reserved.booking_id}/payment-intent`, {
        method: "POST",
        headers: { "Idempotency-Key": "intent-opera-1" },
      });
      expect(intent.status).toBe(201);
      const payment = await intent.json() as { transaction_id: number; reference: string; amount_pence: number; provider: string };
      expect(payment.reference).toStartWith("fake_pi_");
      expect(payment.amount_pence).toBe(5000);
      expect(payment.provider).toBe("local");

      const webhookBody = JSON.stringify({ reference: payment.reference, status: "succeeded", provider: "fake" });
      const signature = await hmacSha256Hex("test-webhook-secret", webhookBody);
      const webhook = await fetch(`${base}/commerce/payments/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-OpenB2C-Signature": `sha256=${signature}`,
        },
        body: webhookBody,
      });
      expect(webhook.status).toBe(200);
      expect(await webhook.json()).toMatchObject({
        booking_id: reserved.booking_id,
        transaction_id: payment.transaction_id,
        status: "paid",
        idempotent: false,
      });

      const db = new Database(dbPath);
      try {
        const booking = db.query<{ status: string }, []>("SELECT status FROM booking WHERE id = ?").get(reserved.booking_id);
        const transaction = db.query<{ status: string }, []>("SELECT status FROM [transaction] WHERE id = ?").get(payment.transaction_id);
        const tickets = db.query<{ status: string }, []>("SELECT status FROM ticket WHERE id IN (SELECT ticket_id FROM booking_ticket WHERE booking_id = ?) ORDER BY id").all(reserved.booking_id);
        expect(booking?.status).toBe("paid");
        expect(transaction?.status).toBe("completed");
        expect(tickets.map(ticket => ticket.status)).toEqual(["confirmed", "confirmed"]);
      } finally {
        db.close();
      }

      const staleReserve = await fetch(`${base}/commerce/bookings/reserve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: 1, performance_id: 1, quantity: 1 }),
      });
      expect(staleReserve.status).toBe(201);
      const stale = await staleReserve.json() as { booking_id: number; ticket_ids: number[] };

      const staleDb = new Database(dbPath);
      try {
        staleDb.query("UPDATE booking SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60000).toISOString(), stale.booking_id);
      } finally {
        staleDb.close();
      }

      const expire = await fetch(`${base}/commerce/bookings/expire`, { method: "POST" });
      expect(expire.status).toBe(200);
      expect(await expire.json()).toEqual({ expired: 1 });

      const finalDb = new Database(dbPath);
      try {
        const expiredBooking = finalDb.query<{ status: string }, []>("SELECT status FROM booking WHERE id = ?").get(stale.booking_id);
        const expiredTicket = finalDb.query<{ status: string }, []>("SELECT status FROM ticket WHERE id = ?").get(stale.ticket_ids[0]);
        const effects = finalDb.query<{ status: string }, []>("SELECT status FROM openb2c_effect_attempt ORDER BY id").all();
        expect(expiredBooking?.status).toBe("expired");
        expect(expiredTicket?.status).toBe("cancelled");
        expect(effects.length).toBeGreaterThanOrEqual(5);
        expect(effects.every(effect => effect.status === "succeeded")).toBe(true);
      } finally {
        finalDb.close();
      }
    } finally {
      server.stop(true);
      clearEnv();
    }
  });
});
