import { Database } from "bun:sqlite";
import type { Performance, PerformanceInput, PerformanceArtist, PerformanceArtistInput } from "../../generated/types";

export function listPerformances(
  _req: Request,
  db: Database,
  _params: Record<string, string>,
): Response {
  const rows = db.query("SELECT * FROM performance ORDER BY date, time").all() as Performance[];
  return Response.json(rows);
}

export function getPerformance(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const row = db.query("SELECT * FROM performance WHERE id = ?").get(id) as Performance | null;
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  // Include artists for this performance
  const artists = db.query(`
    SELECT a.*, pa.role_in_performance
    FROM artist a
    JOIN performance_artist pa ON a.id = pa.artist_id
    WHERE pa.performance_id = ?
  `).all(id);

  return Response.json({ ...row, artists });
}

export async function createPerformance(
  req: Request,
  db: Database,
  _params: Record<string, string>,
): Promise<Response> {
  let input: PerformanceInput;
  try {
    input = (await req.json()) as PerformanceInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!input.title || !input.venue_id || !input.date || !input.time || !input.duration_mins)
    return Response.json({ error: "required fields missing" }, { status: 400 });

  // Verify venue exists
  const venue = db.query("SELECT id FROM venue WHERE id = ?").get(input.venue_id);
  if (!venue)
    return Response.json({ error: "venue not found" }, { status: 400 });

  const result = db
    .query(`INSERT INTO performance (title, venue_id, date, time, duration_mins, description)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
    .get(input.title, input.venue_id, input.date, input.time, input.duration_mins, input.description ?? null) as { id: number };

  return Response.json({ id: result.id }, { status: 201 });
}

export async function updatePerformance(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM performance WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  let input: PerformanceInput;
  try {
    input = (await req.json()) as PerformanceInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  db.query(`UPDATE performance SET title = ?, venue_id = ?, date = ?, time = ?, duration_mins = ?, description = ?
            WHERE id = ?`)
    .run(input.title, input.venue_id, input.date, input.time, input.duration_mins, input.description ?? null, id);

  return Response.json({ id });
}

export function deletePerformance(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const id = Number(params.id);
  if (!Number.isInteger(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const existing = db.query("SELECT id FROM performance WHERE id = ?").get(id);
  if (!existing)
    return Response.json({ error: "not found" }, { status: 404 });

  // Delete associated performance_artist records first
  db.query("DELETE FROM performance_artist WHERE performance_id = ?").run(id);
  db.query("DELETE FROM performance WHERE id = ?").run(id);
  return Response.json({ deleted: true });
}

// Performance-Artist association handlers
export async function addArtistToPerformance(
  req: Request,
  db: Database,
  params: Record<string, string>,
): Promise<Response> {
  const performanceId = Number(params.id);
  if (!Number.isInteger(performanceId))
    return Response.json({ error: "invalid performance id" }, { status: 400 });

  let input: { artist_id: number; role_in_performance?: string };
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // Verify performance exists
  const performance = db.query("SELECT id FROM performance WHERE id = ?").get(performanceId);
  if (!performance)
    return Response.json({ error: "performance not found" }, { status: 404 });

  // Verify artist exists
  const artist = db.query("SELECT id FROM artist WHERE id = ?").get(input.artist_id);
  if (!artist)
    return Response.json({ error: "artist not found" }, { status: 400 });

  const result = db
    .query(`INSERT INTO performance_artist (performance_id, artist_id, role_in_performance)
            VALUES (?, ?, ?) RETURNING id`)
    .get(performanceId, input.artist_id, input.role_in_performance ?? null) as { id: number };

  return Response.json({ id: result.id }, { status: 201 });
}

export function removeArtistFromPerformance(
  _req: Request,
  db: Database,
  params: Record<string, string>,
): Response {
  const performanceId = Number(params.id);
  const artistId = Number(params.artistId);

  if (!Number.isInteger(performanceId) || !Number.isInteger(artistId))
    return Response.json({ error: "invalid id" }, { status: 400 });

  db.query("DELETE FROM performance_artist WHERE performance_id = ? AND artist_id = ?")
    .run(performanceId, artistId);

  return Response.json({ deleted: true });
}
