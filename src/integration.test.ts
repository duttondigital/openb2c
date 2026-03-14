import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Registry } from "./core/module";
import { getModule as customerModule } from "./modules/customer/mod";
import { getModule as venueModule } from "./modules/venue/mod";
import { getModule as artistModule } from "./modules/artist/mod";
import { getModule as performanceModule } from "./modules/performance/mod";
import { getModule as ticketModule } from "./modules/ticket/mod";
import { getModule as transactionModule } from "./modules/transaction/mod";

// Import handlers directly
import * as customerHandlers from "./modules/customer/handlers";
import * as venueHandlers from "./modules/venue/handlers";
import * as artistHandlers from "./modules/artist/handlers";
import * as perfHandlers from "./modules/performance/handlers";
import * as ticketHandlers from "./modules/ticket/handlers";
import * as txnHandlers from "./modules/transaction/handlers";

// Test helper to create a fresh in-memory database with all modules
function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");

  const registry = new Registry();
  registry.register(customerModule());
  registry.register(venueModule());
  registry.register(artistModule());
  registry.register(performanceModule());
  registry.register(ticketModule());
  registry.register(transactionModule());
  registry.initAll(db);

  return db;
}

// Helper to simulate HTTP request/response
async function callHandler(
  handler: Function,
  db: Database,
  method: string,
  body?: unknown,
  params: Record<string, string> = {},
  queryParams?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  let url = "http://localhost/test";
  if (queryParams) {
    const qs = new URLSearchParams(queryParams).toString();
    url += `?${qs}`;
  }

  const req = new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const res = await handler(req, db, params);
  const responseBody = await res.json();
  return { status: res.status, body: responseBody };
}

// ============================================================================
// Module Registration & Dependencies
// ============================================================================

describe("Module System", () => {
  test("all modules register without error", () => {
    const registry = new Registry();
    expect(() => {
      registry.register(customerModule());
      registry.register(venueModule());
      registry.register(artistModule());
      registry.register(performanceModule());
      registry.register(ticketModule());
      registry.register(transactionModule());
    }).not.toThrow();
  });

  test("modules resolve in dependency order", () => {
    const registry = new Registry();
    registry.register(transactionModule()); // depends on customer, ticket
    registry.register(ticketModule()); // depends on customer, performance
    registry.register(performanceModule()); // depends on venue, artist
    registry.register(artistModule());
    registry.register(venueModule());
    registry.register(customerModule());

    const order = registry.resolveOrder();
    const names = order.map((m) => m.name);

    // Check dependencies come before dependents
    expect(names.indexOf("customer")).toBeLessThan(names.indexOf("ticket"));
    expect(names.indexOf("customer")).toBeLessThan(names.indexOf("transaction"));
    expect(names.indexOf("venue")).toBeLessThan(names.indexOf("performance"));
    expect(names.indexOf("artist")).toBeLessThan(names.indexOf("performance"));
    expect(names.indexOf("performance")).toBeLessThan(names.indexOf("ticket"));
    expect(names.indexOf("ticket")).toBeLessThan(names.indexOf("transaction"));
  });

  test("database tables are created", () => {
    const db = createTestDb();
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("customer");
    expect(tableNames).toContain("venue");
    expect(tableNames).toContain("artist");
    expect(tableNames).toContain("performance");
    expect(tableNames).toContain("performance_artist");
    expect(tableNames).toContain("ticket");
    expect(tableNames).toContain("transaction");
    expect(tableNames).toContain("transaction_ticket");
    expect(tableNames).toContain("_modules"); // tracking table
  });
});

// ============================================================================
// Customer Module
// ============================================================================

describe("Customer Module", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("create customer", async () => {
    const res = await callHandler(customerHandlers.createCustomer, db, "POST", {
      name: "John Smith",
      email: "john@example.com",
      phone: "01234567890",
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: number }).id).toBe(1);
  });

  test("create customer - name required", async () => {
    const res = await callHandler(customerHandlers.createCustomer, db, "POST", {
      email: "john@example.com",
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("name is required");
  });

  test("list customers", async () => {
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "Alice" });
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "Bob" });

    const res = await callHandler(customerHandlers.listCustomers, db, "GET");
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(2);
  });

  test("get customer", async () => {
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "Alice", email: "alice@test.com" });

    const res = await callHandler(customerHandlers.getCustomer, db, "GET", undefined, { id: "1" });
    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe("Alice");
  });

  test("get customer - not found", async () => {
    const res = await callHandler(customerHandlers.getCustomer, db, "GET", undefined, { id: "999" });
    expect(res.status).toBe(404);
  });

  test("update customer", async () => {
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "Alice" });

    const res = await callHandler(customerHandlers.updateCustomer, db, "PUT", { name: "Alice Updated" }, { id: "1" });
    expect(res.status).toBe(200);

    const get = await callHandler(customerHandlers.getCustomer, db, "GET", undefined, { id: "1" });
    expect((get.body as { name: string }).name).toBe("Alice Updated");
  });

  test("delete customer", async () => {
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "Alice" });

    const res = await callHandler(customerHandlers.deleteCustomer, db, "DELETE", undefined, { id: "1" });
    expect(res.status).toBe(200);
    expect((res.body as { deleted: boolean }).deleted).toBe(true);

    const get = await callHandler(customerHandlers.getCustomer, db, "GET", undefined, { id: "1" });
    expect(get.status).toBe(404);
  });
});

// ============================================================================
// Venue Module
// ============================================================================

describe("Venue Module", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("create venue", async () => {
    const res = await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Minack Theatre",
      address: "Porthcurno",
      city: "Penzance",
      postcode: "TR19 6JU",
      capacity: 750,
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: number }).id).toBe(1);
  });

  test("create venue - all fields required", async () => {
    const res = await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Minack Theatre",
    });
    expect(res.status).toBe(400);
  });

  test("list venues", async () => {
    await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Venue A",
      address: "1 Street",
      city: "Town",
      postcode: "AB1 2CD",
      capacity: 100,
    });
    await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Venue B",
      address: "2 Street",
      city: "Town",
      postcode: "AB1 2CD",
      capacity: 200,
    });

    const res = await callHandler(venueHandlers.listVenues, db, "GET");
    expect((res.body as unknown[]).length).toBe(2);
  });
});

// ============================================================================
// Artist Module
// ============================================================================

describe("Artist Module", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("create artist", async () => {
    const res = await callHandler(artistHandlers.createArtist, db, "POST", {
      name: "Maria Callas",
      role: "soprano",
      bio: "Legendary opera singer",
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: number }).id).toBe(1);
  });

  test("create artist - name and role required", async () => {
    const res = await callHandler(artistHandlers.createArtist, db, "POST", {
      name: "Test Artist",
    });
    expect(res.status).toBe(400);
  });

  test("list artists", async () => {
    await callHandler(artistHandlers.createArtist, db, "POST", { name: "Artist A", role: "soprano" });
    await callHandler(artistHandlers.createArtist, db, "POST", { name: "Artist B", role: "tenor" });

    const res = await callHandler(artistHandlers.listArtists, db, "GET");
    expect((res.body as unknown[]).length).toBe(2);
  });
});

// ============================================================================
// Performance Module (depends on venue, artist)
// ============================================================================

describe("Performance Module", () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDb();
    // Create prerequisite venue
    await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Minack Theatre",
      address: "Porthcurno",
      city: "Penzance",
      postcode: "TR19 6JU",
      capacity: 750,
    });
    // Create prerequisite artist
    await callHandler(artistHandlers.createArtist, db, "POST", {
      name: "Maria Callas",
      role: "soprano",
    });
  });

  test("create performance", async () => {
    const res = await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 1,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
      description: "Verdi's masterpiece",
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: number }).id).toBe(1);
  });

  test("create performance - venue must exist", async () => {
    const res = await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 999,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("venue not found");
  });

  test("add artist to performance", async () => {
    // Create performance first
    await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 1,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
    });

    const res = await callHandler(perfHandlers.addArtistToPerformance, db, "POST", {
      artist_id: 1,
      role_in_performance: "Violetta",
    }, { id: "1" });
    expect(res.status).toBe(201);
  });

  test("get performance includes artists", async () => {
    // Create performance
    await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 1,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
    });

    // Add artist
    await callHandler(perfHandlers.addArtistToPerformance, db, "POST", {
      artist_id: 1,
      role_in_performance: "Violetta",
    }, { id: "1" });

    const res = await callHandler(perfHandlers.getPerformance, db, "GET", undefined, { id: "1" });
    expect(res.status).toBe(200);
    const body = res.body as { title: string; artists: unknown[] };
    expect(body.title).toBe("La Traviata");
    expect(body.artists.length).toBe(1);
  });

  test("remove artist from performance", async () => {
    // Setup
    await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 1,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
    });
    await callHandler(perfHandlers.addArtistToPerformance, db, "POST", {
      artist_id: 1,
    }, { id: "1" });

    // Remove
    const res = await callHandler(perfHandlers.removeArtistFromPerformance, db, "DELETE", undefined, {
      id: "1",
      artistId: "1",
    });
    expect(res.status).toBe(200);

    // Verify removed
    const get = await callHandler(perfHandlers.getPerformance, db, "GET", undefined, { id: "1" });
    expect((get.body as { artists: unknown[] }).artists.length).toBe(0);
  });
});

// ============================================================================
// Ticket Module (depends on customer, performance)
// ============================================================================

describe("Ticket Module", () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDb();
    // Create prerequisites
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "John Smith" });
    await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Minack Theatre",
      address: "Porthcurno",
      city: "Penzance",
      postcode: "TR19 6JU",
      capacity: 750,
    });
    await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 1,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
    });
  });

  test("create ticket", async () => {
    const res = await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      seat: "A1",
      price_pence: 4500,
      ticket_type: "standard",
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: number }).id).toBe(1);
  });

  test("create ticket - validates performance exists", async () => {
    const res = await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 999,
      customer_id: 1,
      price_pence: 4500,
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("performance not found");
  });

  test("create ticket - validates customer exists", async () => {
    const res = await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 999,
      price_pence: 4500,
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("customer not found");
  });

  test("ticket status defaults to reserved", async () => {
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });

    const res = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: "1" });
    expect((res.body as { status: string }).status).toBe("reserved");
  });

  test("confirm ticket", async () => {
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });

    const res = await callHandler(ticketHandlers.confirmTicket, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("confirmed");
  });

  test("confirm ticket - must be reserved", async () => {
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });
    await callHandler(ticketHandlers.confirmTicket, db, "POST", undefined, { id: "1" });

    // Try to confirm again
    const res = await callHandler(ticketHandlers.confirmTicket, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(400);
  });

  test("cancel ticket", async () => {
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });

    const res = await callHandler(ticketHandlers.cancelTicket, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("cancelled");
  });

  test("list tickets filtered by performance", async () => {
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });

    const res = await callHandler(ticketHandlers.listTickets, db, "GET", undefined, {}, {
      performance_id: "1",
    });
    expect((res.body as unknown[]).length).toBe(2);
  });
});

// ============================================================================
// Transaction Module (depends on customer, ticket)
// ============================================================================

describe("Transaction Module", () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDb();
    // Create prerequisites
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "John Smith" });
    await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Minack Theatre",
      address: "Porthcurno",
      city: "Penzance",
      postcode: "TR19 6JU",
      capacity: 750,
    });
    await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Traviata",
      venue_id: 1,
      date: "2024-08-15",
      time: "19:30",
      duration_mins: 180,
    });
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 4500,
    });
  });

  test("create transaction", async () => {
    const res = await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
      ticket_ids: [1, 2],
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: number }).id).toBe(1);
  });

  test("transaction status defaults to pending", async () => {
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
    });

    const res = await callHandler(txnHandlers.getTransaction, db, "GET", undefined, { id: "1" });
    expect((res.body as { status: string }).status).toBe("pending");
  });

  test("get transaction includes tickets", async () => {
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
      ticket_ids: [1, 2],
    });

    const res = await callHandler(txnHandlers.getTransaction, db, "GET", undefined, { id: "1" });
    expect((res.body as { tickets: unknown[] }).tickets.length).toBe(2);
  });

  test("complete transaction confirms tickets", async () => {
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
      ticket_ids: [1, 2],
    });

    const res = await callHandler(txnHandlers.completeTransaction, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("completed");

    // Verify tickets are confirmed
    const ticket1 = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: "1" });
    const ticket2 = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: "2" });
    expect((ticket1.body as { status: string }).status).toBe("confirmed");
    expect((ticket2.body as { status: string }).status).toBe("confirmed");
  });

  test("complete transaction - must be pending", async () => {
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
    });
    await callHandler(txnHandlers.completeTransaction, db, "POST", undefined, { id: "1" });

    // Try to complete again
    const res = await callHandler(txnHandlers.completeTransaction, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(400);
  });

  test("refund transaction cancels tickets", async () => {
    // Create and complete transaction
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
      ticket_ids: [1, 2],
    });
    await callHandler(txnHandlers.completeTransaction, db, "POST", undefined, { id: "1" });

    // Refund
    const res = await callHandler(txnHandlers.refundTransaction, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("refunded");

    // Verify tickets are cancelled
    const ticket1 = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: "1" });
    expect((ticket1.body as { status: string }).status).toBe("cancelled");
  });

  test("refund transaction - must be completed", async () => {
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 9000,
      type: "purchase",
    });

    // Try to refund pending transaction
    const res = await callHandler(txnHandlers.refundTransaction, db, "POST", undefined, { id: "1" });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// End-to-End Integration Scenario
// ============================================================================

describe("End-to-End: Full Ticket Purchase Flow", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("complete ticket purchase workflow", async () => {
    // 1. Create customer
    const customer = await callHandler(customerHandlers.createCustomer, db, "POST", {
      name: "Alice Cornwall",
      email: "alice@cornwall.co.uk",
      phone: "01234567890",
    });
    expect(customer.status).toBe(201);
    const customerId = (customer.body as { id: number }).id;

    // 2. Create venue
    const venue = await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Minack Theatre",
      address: "Porthcurno",
      city: "Penzance",
      postcode: "TR19 6JU",
      capacity: 750,
    });
    expect(venue.status).toBe(201);
    const venueId = (venue.body as { id: number }).id;

    // 3. Create artists
    const soprano = await callHandler(artistHandlers.createArtist, db, "POST", {
      name: "Emma Soprano",
      role: "soprano",
      bio: "Award-winning opera singer",
    });
    const tenor = await callHandler(artistHandlers.createArtist, db, "POST", {
      name: "Tom Tenor",
      role: "tenor",
    });
    const sopranoId = (soprano.body as { id: number }).id;
    const tenorId = (tenor.body as { id: number }).id;

    // 4. Create performance
    const performance = await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "La Bohème",
      venue_id: venueId,
      date: "2024-07-20",
      time: "19:30",
      duration_mins: 165,
      description: "Puccini's romantic masterpiece",
    });
    expect(performance.status).toBe(201);
    const performanceId = (performance.body as { id: number }).id;

    // 5. Add artists to performance
    await callHandler(perfHandlers.addArtistToPerformance, db, "POST", {
      artist_id: sopranoId,
      role_in_performance: "Mimì",
    }, { id: String(performanceId) });
    await callHandler(perfHandlers.addArtistToPerformance, db, "POST", {
      artist_id: tenorId,
      role_in_performance: "Rodolfo",
    }, { id: String(performanceId) });

    // 6. Verify performance has artists
    const perfDetails = await callHandler(perfHandlers.getPerformance, db, "GET", undefined, {
      id: String(performanceId),
    });
    expect((perfDetails.body as { artists: unknown[] }).artists.length).toBe(2);

    // 7. Create tickets for customer
    const ticket1 = await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: performanceId,
      customer_id: customerId,
      seat: "A1",
      price_pence: 4500,
      ticket_type: "standard",
    });
    const ticket2 = await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: performanceId,
      customer_id: customerId,
      seat: "A2",
      price_pence: 4500,
      ticket_type: "standard",
    });
    const ticketId1 = (ticket1.body as { id: number }).id;
    const ticketId2 = (ticket2.body as { id: number }).id;

    // 8. Create payment transaction
    const txn = await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: customerId,
      amount_pence: 9000,
      type: "card_payment",
      reference: "PAY-12345",
      ticket_ids: [ticketId1, ticketId2],
    });
    expect(txn.status).toBe(201);
    const txnId = (txn.body as { id: number }).id;

    // 9. Verify tickets are reserved
    const t1 = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: String(ticketId1) });
    expect((t1.body as { status: string }).status).toBe("reserved");

    // 10. Complete payment
    const completed = await callHandler(txnHandlers.completeTransaction, db, "POST", undefined, {
      id: String(txnId),
    });
    expect(completed.status).toBe(200);

    // 11. Verify tickets are confirmed
    const t1Final = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: String(ticketId1) });
    const t2Final = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: String(ticketId2) });
    expect((t1Final.body as { status: string }).status).toBe("confirmed");
    expect((t2Final.body as { status: string }).status).toBe("confirmed");

    // 12. Verify transaction shows tickets
    const txnDetails = await callHandler(txnHandlers.getTransaction, db, "GET", undefined, { id: String(txnId) });
    const txnBody = txnDetails.body as { status: string; tickets: unknown[] };
    expect(txnBody.status).toBe("completed");
    expect(txnBody.tickets.length).toBe(2);
  });

  test("refund flow", async () => {
    // Quick setup
    await callHandler(customerHandlers.createCustomer, db, "POST", { name: "Bob" });
    await callHandler(venueHandlers.createVenue, db, "POST", {
      name: "Hall",
      address: "1 St",
      city: "Town",
      postcode: "AB1 2CD",
      capacity: 100,
    });
    await callHandler(perfHandlers.createPerformance, db, "POST", {
      title: "Show",
      venue_id: 1,
      date: "2024-01-01",
      time: "19:00",
      duration_mins: 120,
    });
    await callHandler(ticketHandlers.createTicket, db, "POST", {
      performance_id: 1,
      customer_id: 1,
      price_pence: 2000,
    });

    // Create and complete transaction
    await callHandler(txnHandlers.createTransaction, db, "POST", {
      customer_id: 1,
      amount_pence: 2000,
      type: "purchase",
      ticket_ids: [1],
    });
    await callHandler(txnHandlers.completeTransaction, db, "POST", undefined, { id: "1" });

    // Refund
    const refund = await callHandler(txnHandlers.refundTransaction, db, "POST", undefined, { id: "1" });
    expect(refund.status).toBe(200);

    // Verify ticket cancelled
    const ticket = await callHandler(ticketHandlers.getTicket, db, "GET", undefined, { id: "1" });
    expect((ticket.body as { status: string }).status).toBe("cancelled");

    // Verify transaction status
    const txn = await callHandler(txnHandlers.getTransaction, db, "GET", undefined, { id: "1" });
    expect((txn.body as { status: string }).status).toBe("refunded");
  });
});
