import { Database } from "bun:sqlite";
import * as service from "./service";

function resultToResponse<T>(
  result: service.TransactionResult<T>,
): Response {
  if (result.ok) {
    return Response.json(result.data);
  }
  const status = result.code === "not_found" ? 404 : 400;
  return Response.json({ error: result.error }, { status });
}

function parseId(params: Record<string, string>): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) ? id : null;
}

export function listTransactions(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Response {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id");
  const rows = service.findAll(db, customerId ? Number(customerId) : undefined);
  return Response.json(rows);
}

export function getTransaction(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = parseId(params);
  if (!id) return Response.json({ error: "invalid id" }, { status: 400 });

  const txn = service.findById(db, id);
  if (!txn) return Response.json({ error: "not found" }, { status: 404 });

  const tickets = service.findTickets(db, id);
  return Response.json({ ...txn, tickets });
}

export async function createTransaction(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Promise<Response> {
  let input: service.CreateTransactionInput;
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.customer_id || !input.amount_pence || !input.type) {
    return Response.json({ error: "required fields missing" }, { status: 400 });
  }

  const result = service.create(db, input);
  if (result.ok) {
    return Response.json(result.data, { status: 201 });
  }
  return resultToResponse(result);
}

export async function updateTransaction(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = parseId(params);
  if (!id) return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = service.findById(db, id);
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  let input: { status?: string; reference?: string };
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status ?? null);
  }
  if (input.reference !== undefined) {
    updates.push("reference = ?");
    values.push(input.reference ?? null);
  }

  if (updates.length > 0) {
    values.push(id);
    db.query(`UPDATE [transaction] SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  return Response.json({ id });
}

export function deleteTransaction(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = parseId(params);
  if (!id) return Response.json({ error: "invalid id" }, { status: 400 });

  return resultToResponse(service.remove(db, id));
}

export async function completeTransaction(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = parseId(params);
  if (!id) return Response.json({ error: "invalid id" }, { status: 400 });

  return resultToResponse(service.complete(db, id));
}

export async function refundTransaction(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = parseId(params);
  if (!id) return Response.json({ error: "invalid id" }, { status: 400 });

  return resultToResponse(service.refund(db, id));
}
