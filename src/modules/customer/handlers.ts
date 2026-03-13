import { Database } from "bun:sqlite";
import type { Customer, CustomerInput } from "./types";

export function listCustomers(
  _req: Request,
  db: Database,
  _params: Record<string, string>,
): Response {
  const rows = db
    .query("SELECT id, name, email, phone, created_at FROM customer ORDER BY id")
    .all() as Customer[];
  return Response.json(rows);
}

export function getCustomer(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const row = db
    .query("SELECT id, name, email, phone, created_at FROM customer WHERE id = ?")
    .get(id) as Customer | null;

  if (!row) return Response.json({ error: "customer not found" }, { status: 404 });
  return Response.json(row);
}

export async function createCustomer(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Promise<Response> {
  let input: CustomerInput;
  try {
    input = (await req.json()) as CustomerInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.name)
    return Response.json({ error: "name is required" }, { status: 400 });

  const result = db
    .query("INSERT INTO customer (name, email, phone) VALUES (?, ?, ?) RETURNING id")
    .get(input.name, input.email ?? null, input.phone ?? null) as { id: number };

  return Response.json({ id: result.id }, { status: 201 });
}

export async function updateCustomer(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM customer WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "customer not found" }, { status: 404 });

  let input: CustomerInput;
  try {
    input = (await req.json()) as CustomerInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.name)
    return Response.json({ error: "name is required" }, { status: 400 });

  db.query("UPDATE customer SET name = ?, email = ?, phone = ? WHERE id = ?").run(
    input.name,
    input.email ?? null,
    input.phone ?? null,
    id,
  );

  return Response.json({ id });
}

export function deleteCustomer(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM customer WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "customer not found" }, { status: 404 });

  db.query("DELETE FROM customer WHERE id = ?").run(id);
  return Response.json({ deleted: true });
}
