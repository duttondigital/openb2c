import { Database } from "bun:sqlite";
import type { Venue, VenueInput } from "../../generated/types";

export function listVenues(
  _req: Request,
  db: Database,
  _params: Record<string, string>,
): Response {
  const rows = db.query("SELECT * FROM venue ORDER BY name").all() as Venue[];
  return Response.json(rows);
}

export function getVenue(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const row = db.query("SELECT * FROM venue WHERE id = ?").get(id) as Venue | null;
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

export async function createVenue(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Promise<Response> {
  let input: VenueInput;
  try {
    input = (await req.json()) as VenueInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.name || !input.address || !input.city || !input.postcode || !input.capacity)
    return Response.json({ error: "all fields required" }, { status: 400 });

  const result = db
    .query(`INSERT INTO venue (name, address, city, postcode, capacity)
            VALUES (?, ?, ?, ?, ?) RETURNING id`)
    .get(input.name, input.address, input.city, input.postcode, input.capacity) as { id: number };

  return Response.json({ id: result.id }, { status: 201 });
}

export async function updateVenue(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM venue WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  let input: VenueInput;
  try {
    input = (await req.json()) as VenueInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  db.query(`UPDATE venue SET name = ?, address = ?, city = ?, postcode = ?, capacity = ?
            WHERE id = ?`)
    .run(input.name, input.address, input.city, input.postcode, input.capacity, id);

  return Response.json({ id });
}

export function deleteVenue(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM venue WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  db.query("DELETE FROM venue WHERE id = ?").run(id);
  return Response.json({ deleted: true });
}
