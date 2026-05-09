import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateMigrationStub, planMigration } from "./migration";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Indexes, Schema, Tables } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const oldTables: Tables = {
  customer: {
    id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
    email: { type: "text", pk: false, auto: false, required: true, unique: true, default: null, references: null },
  },
};

const newTables: Tables = {
  customer: {
    id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
    email: { type: "text", pk: false, auto: false, required: true, unique: true, default: null, references: null },
    display_name: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'Anonymous'", references: null },
  },
};

const newIndexes: Indexes = {
  customer: {
    by_email: { columns: ["email"], unique: false },
  },
};

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: newTables,
  indexes: newIndexes,
  operations: {},
};

function applySql(db: Database, sql: string) {
  for (const stmt of sql.split(/;\s*\n/).filter(s => s.trim())) {
    db.run(stmt);
  }
}

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-migration-"));
  mkdirSync(join(dir, "migrations"));
  writeFileSync(join(dir, "schema.sql"), genSQL(newTables, newIndexes));
  writeFileSync(join(dir, "types.ts"), genTypes(newTables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

describe("generated migrations", () => {
  test("generates additive migration stubs with operator guidance", () => {
    const plan = planMigration(oldTables, newTables, {}, newIndexes);
    const stub = generateMigrationStub(plan);

    expect(plan.steps.map(step => step.kind)).toEqual(["add_column", "create_index"]);
    expect(stub).toContain("ALTER TABLE customer ADD COLUMN display_name TEXT DEFAULT 'Anonymous';");
    expect(stub).toContain("CREATE INDEX IF NOT EXISTS customer_by_email ON customer (email);");
    expect(stub).toContain("Rollback:");
    expect(stub).toContain("Forward fix:");
  });

  test("applies migration files once and preserves old data", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "app.sqlite");
    const migration = generateMigrationStub(planMigration(oldTables, newTables, {}, newIndexes));
    writeFileSync(join(dir, "migrations", "001_add_customer_display_name.sql"), migration);

    const db = new Database(dbPath);
    applySql(db, genSQL(oldTables));
    db.query("INSERT INTO customer (email) VALUES (?)").run("ada@example.com");
    db.close();

    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);

    try {
      const migrated = new Database(dbPath);
      const row = migrated.query<{ email: string; display_name: string }, []>(
        "SELECT email, display_name FROM customer"
      ).get();
      const history = migrated.query<{ id: string; description: string }, []>(
        "SELECT id, description FROM openb2c_migration ORDER BY id"
      ).all();
      migrated.close();

      expect(row).toEqual({ email: "ada@example.com", display_name: "Anonymous" });
      expect(history.some(entry => entry.id === "001_add_customer_display_name")).toBe(true);
      expect(history.some(entry => entry.id.startsWith("schema:"))).toBe(true);
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
    }
  });
});
