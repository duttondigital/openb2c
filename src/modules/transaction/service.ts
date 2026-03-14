import { Database } from "bun:sqlite";
import type { Transaction, TransactionInput, Ticket } from "../../generated/types";

export type TransactionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "not_found" | "invalid" | "bad_state" };

export function findById(db: Database, id: number): Transaction | null {
  return db.query("SELECT * FROM [transaction] WHERE id = ?").get(id) as Transaction | null;
}

export function findAll(db: Database, customerId?: number): Transaction[] {
  if (customerId) {
    return db.query("SELECT * FROM [transaction] WHERE customer_id = ? ORDER BY id DESC")
      .all(customerId) as Transaction[];
  }
  return db.query("SELECT * FROM [transaction] ORDER BY id DESC").all() as Transaction[];
}

export function findTickets(db: Database, transactionId: number): Ticket[] {
  return db.query(`
    SELECT t.* FROM ticket t
    JOIN transaction_ticket tt ON t.id = tt.ticket_id
    WHERE tt.transaction_id = ?
  `).all(transactionId) as Ticket[];
}

export interface CreateTransactionInput extends TransactionInput {
  ticket_ids?: number[];
}

export function create(
  db: Database,
  input: CreateTransactionInput,
): TransactionResult<{ id: number }> {
  // Validate customer exists
  const customer = db.query("SELECT id FROM customer WHERE id = ?").get(input.customer_id);
  if (!customer) {
    return { ok: false, error: "customer not found", code: "invalid" };
  }

  const result = db
    .query(`INSERT INTO [transaction] (customer_id, amount_pence, type, status, reference)
            VALUES (?, ?, ?, ?, ?) RETURNING id`)
    .get(
      input.customer_id,
      input.amount_pence,
      input.type,
      input.status ?? "pending",
      input.reference ?? null
    ) as { id: number };

  // Link tickets
  if (input.ticket_ids?.length) {
    const stmt = db.prepare(
      "INSERT INTO transaction_ticket (transaction_id, ticket_id) VALUES (?, ?)"
    );
    for (const ticketId of input.ticket_ids) {
      stmt.run(result.id, ticketId);
    }
  }

  return { ok: true, data: { id: result.id } };
}

export function complete(db: Database, id: number): TransactionResult<{ status: string }> {
  const txn = findById(db, id);
  if (!txn) {
    return { ok: false, error: "not found", code: "not_found" };
  }

  if (txn.status !== "pending") {
    return { ok: false, error: "can only complete pending transactions", code: "bad_state" };
  }

  // Transaction: complete txn + confirm all linked tickets
  const doComplete = db.transaction(() => {
    db.query("UPDATE [transaction] SET status = 'completed' WHERE id = ?").run(id);
    db.query(`
      UPDATE ticket SET status = 'confirmed'
      WHERE id IN (SELECT ticket_id FROM transaction_ticket WHERE transaction_id = ?)
    `).run(id);
  });
  doComplete();

  return { ok: true, data: { status: "completed" } };
}

export function refund(db: Database, id: number): TransactionResult<{ status: string }> {
  const txn = findById(db, id);
  if (!txn) {
    return { ok: false, error: "not found", code: "not_found" };
  }

  if (txn.status !== "completed") {
    return { ok: false, error: "can only refund completed transactions", code: "bad_state" };
  }

  // Transaction: refund txn + cancel all linked tickets
  const doRefund = db.transaction(() => {
    db.query("UPDATE [transaction] SET status = 'refunded' WHERE id = ?").run(id);
    db.query(`
      UPDATE ticket SET status = 'cancelled'
      WHERE id IN (SELECT ticket_id FROM transaction_ticket WHERE transaction_id = ?)
    `).run(id);
  });
  doRefund();

  return { ok: true, data: { status: "refunded" } };
}

export function remove(db: Database, id: number): TransactionResult<{ deleted: boolean }> {
  const txn = findById(db, id);
  if (!txn) {
    return { ok: false, error: "not found", code: "not_found" };
  }

  db.query("DELETE FROM transaction_ticket WHERE transaction_id = ?").run(id);
  db.query("DELETE FROM [transaction] WHERE id = ?").run(id);

  return { ok: true, data: { deleted: true } };
}
