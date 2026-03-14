import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Registry } from "../../core/module";
import { getModule as customerModule } from "../customer/mod";
import { getModule as venueModule } from "../venue/mod";
import { getModule as artistModule } from "../artist/mod";
import { getModule as performanceModule } from "../performance/mod";
import { getModule as ticketModule } from "../ticket/mod";
import { getModule as transactionModule } from "./mod";
import * as service from "./service";

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

function seedTestData(db: Database) {
  // Customer
  db.run("INSERT INTO customer (name) VALUES ('Test Customer')");
  // Venue
  db.run("INSERT INTO venue (name, address, city, postcode, capacity) VALUES ('Hall', '1 St', 'Town', 'AB1 2CD', 100)");
  // Performance
  db.run("INSERT INTO performance (title, venue_id, date, time, duration_mins) VALUES ('Show', 1, '2024-01-01', '19:00', 120)");
  // Tickets
  db.run("INSERT INTO ticket (performance_id, customer_id, price_pence) VALUES (1, 1, 2500)");
  db.run("INSERT INTO ticket (performance_id, customer_id, price_pence) VALUES (1, 1, 2500)");
}

describe("Transaction Service", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
  });

  describe("create", () => {
    test("creates transaction", () => {
      const result = service.create(db, {
        customer_id: 1,
        amount_pence: 5000,
        type: "purchase",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(1);
      }
    });

    test("creates transaction with linked tickets", () => {
      const result = service.create(db, {
        customer_id: 1,
        amount_pence: 5000,
        type: "purchase",
        ticket_ids: [1, 2],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const tickets = service.findTickets(db, result.data.id);
        expect(tickets.length).toBe(2);
      }
    });

    test("fails if customer not found", () => {
      const result = service.create(db, {
        customer_id: 999,
        amount_pence: 5000,
        type: "purchase",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid");
        expect(result.error).toBe("customer not found");
      }
    });
  });

  describe("complete", () => {
    test("completes pending transaction", () => {
      service.create(db, { customer_id: 1, amount_pence: 5000, type: "purchase" });

      const result = service.complete(db, 1);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("completed");
      }
    });

    test("confirms linked tickets", () => {
      service.create(db, {
        customer_id: 1,
        amount_pence: 5000,
        type: "purchase",
        ticket_ids: [1, 2],
      });

      service.complete(db, 1);

      const tickets = db.query("SELECT status FROM ticket WHERE id IN (1, 2)").all() as { status: string }[];
      expect(tickets.every((t) => t.status === "confirmed")).toBe(true);
    });

    test("fails if not found", () => {
      const result = service.complete(db, 999);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    test("fails if not pending", () => {
      service.create(db, { customer_id: 1, amount_pence: 5000, type: "purchase" });
      service.complete(db, 1);

      const result = service.complete(db, 1); // try again

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("bad_state");
      }
    });
  });

  describe("refund", () => {
    test("refunds completed transaction", () => {
      service.create(db, { customer_id: 1, amount_pence: 5000, type: "purchase" });
      service.complete(db, 1);

      const result = service.refund(db, 1);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("refunded");
      }
    });

    test("cancels linked tickets", () => {
      service.create(db, {
        customer_id: 1,
        amount_pence: 5000,
        type: "purchase",
        ticket_ids: [1, 2],
      });
      service.complete(db, 1);
      service.refund(db, 1);

      const tickets = db.query("SELECT status FROM ticket WHERE id IN (1, 2)").all() as { status: string }[];
      expect(tickets.every((t) => t.status === "cancelled")).toBe(true);
    });

    test("fails if not completed", () => {
      service.create(db, { customer_id: 1, amount_pence: 5000, type: "purchase" });

      const result = service.refund(db, 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("bad_state");
      }
    });
  });

  describe("remove", () => {
    test("deletes transaction", () => {
      service.create(db, { customer_id: 1, amount_pence: 5000, type: "purchase" });

      const result = service.remove(db, 1);

      expect(result.ok).toBe(true);
      expect(service.findById(db, 1)).toBeNull();
    });

    test("removes ticket links", () => {
      service.create(db, {
        customer_id: 1,
        amount_pence: 5000,
        type: "purchase",
        ticket_ids: [1],
      });

      service.remove(db, 1);

      const links = db.query("SELECT * FROM transaction_ticket WHERE transaction_id = 1").all();
      expect(links.length).toBe(0);
    });

    test("fails if not found", () => {
      const result = service.remove(db, 999);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });
  });

  describe("queries", () => {
    test("findAll returns all transactions", () => {
      service.create(db, { customer_id: 1, amount_pence: 1000, type: "purchase" });
      service.create(db, { customer_id: 1, amount_pence: 2000, type: "purchase" });

      const all = service.findAll(db);
      expect(all.length).toBe(2);
    });

    test("findAll filters by customer", () => {
      db.run("INSERT INTO customer (name) VALUES ('Other')");
      service.create(db, { customer_id: 1, amount_pence: 1000, type: "purchase" });
      service.create(db, { customer_id: 2, amount_pence: 2000, type: "purchase" });

      const filtered = service.findAll(db, 1);
      expect(filtered.length).toBe(1);
    });

    test("findById returns null for missing", () => {
      expect(service.findById(db, 999)).toBeNull();
    });
  });
});
