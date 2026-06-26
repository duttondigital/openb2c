import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { genOpenAPI } from "./openapi";
import { genSQL } from "./sql";
import type { Schema } from "./types";
import { validateSchema } from "./validation";

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

describe("Duchy Opera production backend", () => {
  test("composes production scheduling and materials bundles", async () => {
    const schema = await loadDuchyOperaSchema();

    expect(validateSchema(schema)).toEqual([]);
    for (const table of [
      "production",
      "production_role",
      "production_member",
      "rehearsal",
      "rehearsal_call",
      "rehearsal_requirement",
      "rehearsal_coverage",
      "production_material",
      "material_version",
      "artist_profile",
    ]) {
      expect(schema.tables[table]).toBeDefined();
    }

    expect(schema.tables.artist).toBeUndefined();
    expect(schema.tables.artist_profile.user_id).toMatchObject({
      type: "integer",
      required: true,
      unique: true,
      references: "user(id)",
    });
    expect(schema.tables.production_member.user_id.references).toBe("user(id)");
    expect(schema.tables.rehearsal_call.user_id.references).toBe("user(id)");
    expect(schema.tables.production.opens_on).toBeUndefined();
    expect(schema.tables.production.closes_on).toBeUndefined();
    expect(schema.tables.performance.production_id).toMatchObject({
      type: "integer",
      required: true,
      references: "production(id)",
    });

    expect(schema.workflows?.groups).toMatchObject({
      productionLifecycle: { label: "Production lifecycle" },
      rehearsalLifecycle: { label: "Rehearsal lifecycle" },
      rehearsalAttendance: { label: "Rehearsal attendance" },
      materialsLifecycle: { label: "Materials lifecycle" },
    });

    expect(schema.operations.production.activate).toBeDefined();
    expect(schema.operations.rehearsal.publish.effects).toContainEqual({ emit: "rehearsal.publish" });
    expect(schema.operations.rehearsal.publish.effects).toContainEqual({
      emit: null,
      notify: { channel: "email", template: "rehearsal_published", to: "participants" },
      call: null,
    });
    expect(schema.operations.production_material.publish).toBeDefined();
    expect(schema.operations.material_version.mark_current).toBeDefined();
  });

  test("generates backend contracts for production scheduling", async () => {
    const schema = await loadDuchyOperaSchema();
    const sql = genSQL(schema.tables, schema.indexes);
    const openapi = JSON.parse(genOpenAPI(schema));

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS production");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS rehearsal");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS production_material");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS artist_profile");
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS artist\s*\(/);
    expect(sql).not.toContain("opens_on");
    expect(sql).not.toContain("closes_on");
    expect(sql).toContain("production_id INTEGER NOT NULL REFERENCES production(id)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS performance_by_production_date");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS rehearsal_call_unique_rehearsal_user");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS material_version_unique_material_version");

    expect(openapi.components.schemas.Artist).toBeUndefined();
    expect(openapi.components.schemas.ArtistProfile).toBeDefined();
    expect(openapi.components.schemas.Production.properties.opens_on).toBeUndefined();
    expect(openapi.components.schemas.Production.properties.closes_on).toBeUndefined();
    expect(openapi.components.schemas.ProductionMember.properties.user_id["x-openb2c-relationship"]).toMatchObject({
      targetEntity: "user",
      label: "Person",
      targetLabel: { entity: "user", field: "name" },
    });
    expect(openapi.components.schemas.Performance.properties.production_id["x-openb2c-relationship"]).toMatchObject({
      targetEntity: "production",
      label: "Production",
      targetLabel: { entity: "production", field: "title" },
    });
    expect(openapi.paths["/api/productions"]).toBeDefined();
    expect(openapi.paths["/api/rehearsals/{id}/publish"]).toBeDefined();
    expect(openapi.paths["/api/production_materials"]).toBeDefined();
    expect(openapi.paths["/api/material_versions/{id}/mark-current"]).toBeDefined();
    expect(openapi["x-openb2c-workflows"].operationWorkflows.rehearsal.publish.transitions).toEqual([
      {
        field: { table: "rehearsal", field: "status", references: null },
        from: ["draft"],
        to: "published",
      },
    ]);
  });
});
