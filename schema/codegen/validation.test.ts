import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";
import { validateSchema } from "./validation";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

const baseColumn = {
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

async function loadExampleSchema(example: string): Promise<Schema> {
  const proc = Bun.spawn(["nix", "eval", "--json", "-f", join(PROJECT_ROOT, "examples", example, "composition.nix")], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`nix eval failed for ${example}: ${stderr}`);
  return JSON.parse(stdout) as Schema;
}

function invalidSchema(): Schema {
  return {
    organization: DEFAULT_ORGANIZATION_METADATA,
    tables: {
      order: {
        id: { ...baseColumn, type: "integer", pk: true, auto: true },
        user_id: { ...baseColumn, type: "integer", references: "person(id)" },
        status: { ...baseColumn, type: "text" },
      },
      line_item: {
        id: { ...baseColumn, type: "integer", pk: true, auto: true },
        order_id: { ...baseColumn, type: "integer", references: "order(id)" },
      },
    },
    indexes: {
      order: {
        by_missing: { columns: ["missing"], unique: false },
      },
    },
    relationships: {
      order: {
        owner: { field: { table: "order", field: "owner_id", references: "user(id)" } },
      },
    },
    operations: {
      order: {
        ship: {
          guard: { _t: "field", name: "state" },
          relationships: [{ field: { table: "order", field: "owner_id", references: "user(id)" } }],
          public: false,
          scope: null,
          set: { state: "shipped" },
          cascade: [{ entity: "line_item", via: null, set: { state: "cancelled" } }],
          effects: [],
        },
      },
    },
  };
}

describe("schema validation diagnostics", () => {
  test("real example compositions pass codegen validation", async () => {
    const duchyOpera = await loadExampleSchema("duchyopera");
    const ticketing = await loadExampleSchema("ticketing");

    expect(validateSchema(duchyOpera)).toEqual([]);
    expect(validateSchema(ticketing)).toEqual([]);
  });

  test("reports path-specific diagnostics for invalid schemas", () => {
    const diagnostics = validateSchema(invalidSchema());

    expect(diagnostics).toEqual(expect.arrayContaining([
      { path: "tables.order.user_id.references", message: 'references unknown table "person"' },
      { path: "indexes.order.by_missing.columns", message: "references unknown field order.missing" },
      { path: "relationships.order.owner.field.field", message: "references unknown field order.owner_id" },
      { path: "operations.order.ship.set.state", message: "references unknown field order.state" },
      { path: "operations.order.ship.guard.name", message: "references unknown field order.state" },
      { path: "operations.order.ship.cascade.0.set.state", message: "references unknown field line_item.state" },
    ]));
  });

  test("codegen CLI refuses invalid schemas before writing artifacts", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "openb2c-invalid-codegen-"));
    const proc = Bun.spawn(["bun", join(PROJECT_ROOT, "schema", "codegen", "index.ts"), outDir], {
      cwd: PROJECT_ROOT,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write(JSON.stringify(invalidSchema()));
    proc.stdin.end();

    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Schema validation failed:");
    expect(stderr).toContain("tables.order.user_id.references: references unknown table \"person\"");
    expect(existsSync(join(outDir, "server.ts"))).toBe(false);
  });
});
