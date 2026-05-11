import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
import { genOpenAPI } from "./openapi";
import { genRuntime } from "./runtime";
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
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
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
    db.query("INSERT INTO performance (id, title, venue_id, date, time, duration_mins, price_pence, status) VALUES (2, 'Cancelled Gala', 1, '2026-06-13', '19:30', 120, 3000, 'cancelled')").run();
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

function ref(table: string, field: string, references: string | null = null) {
  return { table, field, references };
}

function genericShopSchema(): Schema {
  return {
    organization: { name: "Generic Shop", description: "Generic ecommerce test" },
    tables: {
      user: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      product: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        price_pence: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        status: { type: "text", pk: false, auto: false, required: true, unique: false, default: "'available'", references: null },
      },
      cart_order: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        user_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "user(id)" },
        status: { type: "text", pk: false, auto: false, required: true, unique: false, default: "'checkout_pending'", references: null },
        amount_pence: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        currency: { type: "text", pk: false, auto: false, required: true, unique: false, default: "'GBP'", references: null },
        expires_at: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        payment_reference: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
        client: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'web'", references: null },
      },
      cart_line: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        product_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "product(id)" },
        user_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "user(id)" },
        price_pence: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        status: { type: "text", pk: false, auto: false, required: true, unique: false, default: "'reserved'", references: null },
        colour: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
      },
      cart_order_line: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        cart_order_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "cart_order(id)" },
        cart_line_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "cart_line(id)" },
      },
      payment: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        user_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "user(id)" },
        amount_pence: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        status: { type: "text", pk: false, auto: false, required: true, unique: false, default: "'pending'", references: null },
        reference: { type: "text", pk: false, auto: false, required: true, unique: true, default: null, references: null },
        client: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'web'", references: null },
      },
      payment_line: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        payment_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "payment(id)" },
        cart_line_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "cart_line(id)" },
      },
    },
    operations: {},
    ecommerce: {
      enabled: true,
      catalog: {
        entity: "product",
        title: ref("product", "name"),
        description: null,
        price: ref("product", "price_pence"),
        groupBy: [ref("product", "name")],
        variantFields: [],
        availability: { field: ref("product", "status"), available: "available" },
      },
      order: {
        entity: "cart_order",
        user: ref("cart_order", "user_id", "user(id)"),
        status: ref("cart_order", "status"),
        amount: ref("cart_order", "amount_pence"),
        currency: ref("cart_order", "currency"),
        expiresAt: ref("cart_order", "expires_at"),
        paymentReference: ref("cart_order", "payment_reference"),
        client: ref("cart_order", "client"),
        pendingStatus: "checkout_pending",
        paidStatus: "paid",
        expiredStatus: "expired",
        cancelledStatus: "cancelled",
      },
      lineItem: {
        entity: "cart_line",
        catalogItem: ref("cart_line", "product_id", "product(id)"),
        user: ref("cart_line", "user_id", "user(id)"),
        price: ref("cart_line", "price_pence"),
        status: ref("cart_line", "status"),
        quantity: null,
        reservedStatus: "reserved",
        fulfilledStatus: "fulfilled",
        cancelledStatus: "cancelled",
        options: {
          colour: { field: ref("cart_line", "colour"), type: "text", label: "Colour", default: null, choices: ["black", "white"], required: false, min: null, max: null },
        },
      },
      orderLine: {
        entity: "cart_order_line",
        order: ref("cart_order_line", "cart_order_id", "cart_order(id)"),
        lineItem: ref("cart_order_line", "cart_line_id", "cart_line(id)"),
      },
      transaction: {
        entity: "payment",
        user: ref("payment", "user_id", "user(id)"),
        amount: ref("payment", "amount_pence"),
        type: null,
        status: ref("payment", "status"),
        reference: ref("payment", "reference"),
        client: ref("payment", "client"),
        purchaseType: "purchase",
        pendingStatus: "pending",
        completedStatus: "completed",
        failedStatus: "failed",
      },
      transactionLine: {
        entity: "payment_line",
        transaction: ref("payment_line", "payment_id", "payment(id)"),
        lineItem: ref("payment_line", "cart_line_id", "cart_line(id)"),
      },
      checkout: { currency: "GBP", expiryMinutes: 15, maxQuantity: 20, maxLines: 50 },
    },
  };
}

describe("Duchy Opera commerce workflow", () => {
  test("generic ecommerce generation does not expose booking-specific compatibility aliases", () => {
    const schema = genericShopSchema();
    const services = genServices(schema);
    const routes = genRoutes(schema);
    const mcp = genMcpServer(schema);
    const openapi = JSON.parse(genOpenAPI(schema));

    expect(services).toContain("checkoutCommerceCart");
    expect(services).not.toContain("ReserveBookingInput");
    expect(routes).toContain("/commerce/checkout");
    expect(routes).toContain('path: "/commerce/catalog"');
    expect(routes).not.toContain("/commerce/bookings/reserve");
    expect(routes).toContain('path: "/auth/context"');
    expect(routes).toContain('url.pathname.startsWith("/auth/")');
    expect(mcp).toContain("checkout_cart");
    expect(mcp).toContain("list_commerce_catalog");
    expect(mcp).not.toContain("reserve_booking");
    expect(openapi.paths["/commerce/checkout"]).toBeDefined();
    expect(openapi.paths["/commerce/catalog"]).toBeDefined();
    expect(openapi.paths["/commerce/bookings/reserve"]).toBeUndefined();
    expect(openapi.paths["/auth/context"]).toBeDefined();
    expect(openapi.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(openapi.components.securitySchemes.certificateAuth).toMatchObject({ type: "apiKey", name: "X-Certificate" });
    expect(openapi.paths["/commerce/catalog"].get.security).toBeUndefined();
    expect(openapi.paths["/commerce/checkout"].post.security).toEqual([
      { bearerAuth: [] },
      { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
    ]);
    expect(openapi.paths["/commerce/payments/webhook"].post.security).toEqual([{ paymentWebhookSignature: [] }]);
    expect(openapi.components.schemas.CommerceCheckoutInput).toMatchObject({
      additionalProperties: false,
      properties: {
        items: { minItems: 1, maxItems: 50 },
      },
    });
    expect(openapi.components.schemas.CommerceCartItemInput).toMatchObject({
      additionalProperties: false,
      properties: {
        quantity: { minimum: 1, maximum: 20 },
        options: { $ref: "#/components/schemas/CommerceCartItemOptions" },
      },
    });
    expect(openapi.components.schemas.CommerceCartItemOptions).toMatchObject({
      additionalProperties: false,
      properties: {
        colour: { type: "string", enum: ["black", "white"], nullable: true },
      },
    });
  });

  test("Duchy Opera ecommerce does not expose booking aliases unless explicitly enabled", async () => {
    const schema = await loadDuchyOperaSchema();
    const services = genServices(schema);
    const routes = genRoutes(schema);
    const mcp = genMcpServer(schema);
    const effects = genEffectsInterface(schema);
    const openapi = JSON.parse(genOpenAPI(schema));

    expect(services).not.toContain("ReserveBookingInput");
    expect(routes).not.toContain("/commerce/bookings/reserve");
    expect(mcp).not.toContain("reserve_booking");
    expect(effects).not.toContain('"booking.reserved"');
    expect(openapi.paths["/commerce/bookings/reserve"]).toBeUndefined();

    const compatSchema: Schema = {
      ...schema,
      ecommerce: {
        ...schema.ecommerce!,
        compatibility: { bookingAliases: true },
      },
    };
    expect(genServices(compatSchema)).toContain("ReserveBookingInput");
    expect(genRoutes(compatSchema)).toContain("/commerce/bookings/reserve");
    expect(genMcpServer(compatSchema)).toContain("reserve_booking");
    expect(genEffectsInterface(compatSchema)).toContain('"booking.reserved"');
    expect(JSON.parse(genOpenAPI(compatSchema)).paths["/commerce/bookings/reserve"]).toBeDefined();
  });

  test("commerce browser UI derives checkout user from auth context", async () => {
    const commerceUi = await Bun.file(join(PROJECT_ROOT, "schema", "ui", "components", "ob-commerce.ts")).text();
    const authMenuUi = await Bun.file(join(PROJECT_ROOT, "schema", "ui", "components", "ob-auth-menu.ts")).text();
    const authPanelUi = await Bun.file(join(PROJECT_ROOT, "schema", "ui", "components", "ob-auth-panel.ts")).text();
    const routeUi = await Bun.file(join(PROJECT_ROOT, "schema", "ui", "components", "ob-route-outlet.ts")).text();
    const appUi = await Bun.file(join(PROJECT_ROOT, "schema", "ui", "components", "ob-app.ts")).text();
    const apiUi = await Bun.file(join(PROJECT_ROOT, "schema", "ui", "components", "ob-api.ts")).text();

    expect(commerceUi).toContain("authContext.userId");
    expect(commerceUi).toContain('request("/commerce/catalog")');
    expect(commerceUi).not.toContain("/api/${entity}s?limit=200");
    expect(commerceUi).toContain("ob-auth-required");
    expect(commerceUi).toContain("Sign in to continue");
    expect(commerceUi).toContain('returnTo: "/commerce"');
    expect(commerceUi).toContain("sessionStorage");
    expect(commerceUi).not.toContain('inputmode="email"');
    expect(commerceUi).not.toContain("checkout-customer");
    expect(commerceUi).not.toContain("Select a customer");
    expect(commerceUi).not.toContain("body.user_id");
    expect(commerceUi).not.toContain("Response JSON");
    expect(commerceUi).not.toContain("_renderLinks");
    expect(commerceUi).not.toContain("data-form=\"signin\"");
    expect(authMenuUi).toContain("#/login");
    expect(authMenuUi).not.toContain('inputmode="email"');
    expect(authPanelUi).toContain('inputmode="email"');
    expect(authPanelUi).toContain("setCertificateAuth");
    expect(authPanelUi).toContain("clearAuthContext");
    expect(routeUi).toContain("./ob-auth-page");
    expect(appUi).toContain("<ob-auth-menu>");
    expect(apiUi).toContain("hasIdentityAuth");
    expect(apiUi).toContain("setCertificateAuth");
    expect(apiUi).toContain("X-Certificate");
  });

  test("checks out a cart, creates a payment intent, confirms paid orders, and expires stale checkouts", async () => {
    const schema = await loadDuchyOperaSchema();
    expect(schema.ecommerce?.enabled).toBe(true);
    expect(schema.ecommerce?.catalog.entity).toBe("performance");
    expect(schema.ecommerce?.order.entity).toBe("booking");
    expect(schema.ecommerce?.lineItem.entity).toBe("ticket");

    const dir = writeGenerated(schema);
    const dbPath = join(dir, "duchy-commerce.sqlite");
    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";

    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;
    seedDuchyOpera(dbPath);

    try {
      const catalog = await fetch(`${base}/commerce/catalog`);
      expect(catalog.status).toBe(200);
      const catalogBody = await catalog.json() as {
        items: { id: number; title: string }[];
        lookups: Record<string, Record<string, string>>;
      };
      expect(catalogBody.items.map(item => item.title)).toEqual(["The Magic Flute"]);
      expect(catalogBody.lookups.venue_id["1"]).toBe("Hall for Cornwall");

      const directDb = new Database(dbPath);
      try {
        const directCheckout = services.checkoutCommerceCart(directDb, {
          client: "web",
          items: [{ item_id: 1, quantity: 1, options: { ticket_type: "standard" } }],
        }, { userId: 1, scopes: ["*"] });
        expect(directCheckout.ok).toBe(true);
      } finally {
        directDb.close();
      }

      const checkout = await fetch(`${base}/commerce/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "checkout-opera-1" },
        body: JSON.stringify({
          user_id: 1,
          client: "web",
          items: [
            {
              item_id: 1,
              quantity: 2,
              options: { ticket_type: "standard" },
            },
          ],
        }),
      });
      expect(checkout.status).toBe(201);
      const checkedOut = await checkout.json() as { order_id: number; line_item_ids: number[]; amount_pence: number; status: string };
      expect(checkedOut.line_item_ids).toHaveLength(2);
      expect(checkedOut.amount_pence).toBe(5000);
      expect(checkedOut.status).toBe("checkout_pending");

      const intent = await fetch(`${base}/commerce/orders/${checkedOut.order_id}/payment-intent`, {
        method: "POST",
        headers: { "Idempotency-Key": "intent-opera-1" },
      });
      expect(intent.status).toBe(201);
      const payment = await intent.json() as { order_id: number; transaction_id: number; reference: string; amount_pence: number; provider: string };
      expect(payment.order_id).toBe(checkedOut.order_id);
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
        order_id: checkedOut.order_id,
        transaction_id: payment.transaction_id,
        status: "paid",
        idempotent: false,
      });

      const db = new Database(dbPath);
      try {
        const booking = db.query<{ status: string }, []>("SELECT status FROM booking WHERE id = ?").get(checkedOut.order_id);
        const transaction = db.query<{ status: string }, []>("SELECT status FROM [transaction] WHERE id = ?").get(payment.transaction_id);
        const tickets = db.query<{ status: string }, []>("SELECT status FROM ticket WHERE id IN (SELECT ticket_id FROM booking_ticket WHERE booking_id = ?) ORDER BY id").all(checkedOut.order_id);
        expect(booking?.status).toBe("paid");
        expect(transaction?.status).toBe("completed");
        expect(tickets.map(ticket => ticket.status)).toEqual(["confirmed", "confirmed"]);
      } finally {
        db.close();
      }

      const staleCheckout = await fetch(`${base}/commerce/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: 1, items: [{ item_id: 1, quantity: 1 }] }),
      });
      expect(staleCheckout.status).toBe(201);
      const stale = await staleCheckout.json() as { order_id: number; line_item_ids: number[] };

      const staleDb = new Database(dbPath);
      try {
        staleDb.query("UPDATE booking SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60000).toISOString(), stale.order_id);
      } finally {
        staleDb.close();
      }

      const expire = await fetch(`${base}/commerce/orders/expire`, { method: "POST" });
      expect(expire.status).toBe(200);
      expect(await expire.json()).toEqual({ expired: 1 });

      const finalDb = new Database(dbPath);
      try {
        const expiredBooking = finalDb.query<{ status: string }, []>("SELECT status FROM booking WHERE id = ?").get(stale.order_id);
        const expiredTicket = finalDb.query<{ status: string }, []>("SELECT status FROM ticket WHERE id = ?").get(stale.line_item_ids[0]);
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
