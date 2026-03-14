import { Database } from "bun:sqlite";
import type { Ticket, TicketInput } from "../../generated/types";

export function listTickets(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Response {
  const url = new URL(req.url);
  const performanceId = url.searchParams.get("performance_id");
  const customerId = url.searchParams.get("customer_id");

  let query = "SELECT * FROM ticket WHERE 1=1";
  const params: number[] = [];

  if (performanceId) {
    query += " AND performance_id = ?";
    params.push(Number(performanceId));
  }
  if (customerId) {
    query += " AND customer_id = ?";
    params.push(Number(customerId));
  }

  query += " ORDER BY id";
  const rows = db.query(query).all(...params) as Ticket[];
  return Response.json(rows);
}

export function getTicket(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const row = db.query("SELECT * FROM ticket WHERE id = ?").get(id) as Ticket | null;
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

export async function createTicket(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Promise<Response> {
  let input: TicketInput;
  try {
    input = (await req.json()) as TicketInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.performance_id || !input.customer_id || !input.price_pence)
    return Response.json({ error: "required fields missing" }, { status: 400 });

  // Verify performance exists
  const performance = db.query("SELECT id FROM performance WHERE id = ?").get(input.performance_id);
  if (!performance)
    return Response.json({ error: "performance not found" }, { status: 400 });

  // Verify customer exists
  const customer = db.query("SELECT id FROM customer WHERE id = ?").get(input.customer_id);
  if (!customer)
    return Response.json({ error: "customer not found" }, { status: 400 });

  const result = db
    .query(`INSERT INTO ticket (performance_id, customer_id, seat, price_pence, ticket_type, status)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
    .get(
      input.performance_id,
      input.customer_id,
      input.seat ?? null,
      input.price_pence,
      input.ticket_type ?? "standard",
      input.status ?? "reserved"
    ) as { id: number };

  return Response.json({ id: result.id }, { status: 201 });
}

export async function updateTicket(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM ticket WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  let input: Partial<TicketInput>;
  try {
    input = (await req.json()) as Partial<TicketInput>;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // Only update provided fields
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.seat !== undefined) {
    updates.push("seat = ?");
    values.push(input.seat ?? null);
  }
  if (input.price_pence !== undefined) {
    updates.push("price_pence = ?");
    values.push(input.price_pence);
  }
  if (input.ticket_type !== undefined) {
    updates.push("ticket_type = ?");
    values.push(input.ticket_type ?? null);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status ?? null);
  }

  if (updates.length > 0) {
    values.push(id);
    db.query(`UPDATE ticket SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  return Response.json({ id });
}

export function deleteTicket(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM ticket WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  db.query("DELETE FROM ticket WHERE id = ?").run(id);
  return Response.json({ deleted: true });
}

// Ticket status transitions
export async function confirmTicket(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const ticket = db.query("SELECT * FROM ticket WHERE id = ?").get(id) as Ticket | null;
  if (!ticket)
    return Response.json({ error: "not found" }, { status: 404 });

  if (ticket.status !== "reserved")
    return Response.json({ error: "can only confirm reserved tickets" }, { status: 400 });

  db.query("UPDATE ticket SET status = 'confirmed' WHERE id = ?").run(id);
  return Response.json({ id, status: "confirmed" });
}

export async function cancelTicket(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const ticket = db.query("SELECT * FROM ticket WHERE id = ?").get(id) as Ticket | null;
  if (!ticket)
    return Response.json({ error: "not found" }, { status: 404 });

  db.query("UPDATE ticket SET status = 'cancelled' WHERE id = ?").run(id);
  return Response.json({ id, status: "cancelled" });
}
