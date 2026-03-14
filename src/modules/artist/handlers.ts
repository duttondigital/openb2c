import { Database } from "bun:sqlite";
import type { Artist, ArtistInput } from "../../generated/types";

export function listArtists(
  _req: Request,
  db: Database,
  _params: Record<string, string>,
): Response {
  const rows = db.query("SELECT * FROM artist ORDER BY name").all() as Artist[];
  return Response.json(rows);
}

export function getArtist(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const row = db.query("SELECT * FROM artist WHERE id = ?").get(id) as Artist | null;
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

export async function createArtist(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Promise<Response> {
  let input: ArtistInput;
  try {
    input = (await req.json()) as ArtistInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.name || !input.role)
    return Response.json({ error: "name and role required" }, { status: 400 });

  const result = db
    .query(`INSERT INTO artist (name, role, bio, email)
            VALUES (?, ?, ?, ?) RETURNING id`)
    .get(input.name, input.role, input.bio ?? null, input.email ?? null) as { id: number };

  return Response.json({ id: result.id }, { status: 201 });
}

export async function updateArtist(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM artist WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  let input: ArtistInput;
  try {
    input = (await req.json()) as ArtistInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  db.query(`UPDATE artist SET name = ?, role = ?, bio = ?, email = ? WHERE id = ?`)
    .run(input.name, input.role, input.bio ?? null, input.email ?? null, id);

  return Response.json({ id });
}

export function deleteArtist(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM artist WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  db.query("DELETE FROM artist WHERE id = ?").run(id);
  return Response.json({ deleted: true });
}
