import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genRuntime } from "./runtime";
import { genSeedSQL } from "./seed";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { validateSchema } from "./validation";
import type { Column, Schema } from "./types";

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

async function loadExample(name: string): Promise<Schema> {
  const result = await nixEvalJson(["-f", join(PROJECT_ROOT, "examples", name, "composition.nix")]);
  if (result.exitCode !== 0) {
    throw new Error(`nix eval failed for ${name}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Schema;
}

const baseColumn: Column = {
  type: "text",
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

function col(overrides: Partial<Column>): Column {
  return { ...baseColumn, ...overrides };
}

function seedSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    organization: { name: "Seed Test", description: "Seed data test app", logo: null },
    tables: {
      setting: {
        key: col({ pk: true, required: true }),
        value: col({ required: true }),
      },
      product: {
        id: col({ type: "integer", pk: true, auto: true }),
        sku: col({ required: true, unique: true }),
        name: col({ required: true }),
        price_pence: col({ type: "integer", required: true }),
      },
    },
    seed: {
      reference: {
        setting: [
          { key: "currency", value: "GBP" },
        ],
      },
      fixtures: {
        product: [
          { id: 1, sku: "demo-ticket", name: "Demo ticket", price_pence: 2500 },
        ],
      },
      applyFixturesByDefault: false,
    },
    operations: {},
    ...overrides,
  };
}

function writeGenerated(schema: Schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-seed-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables, schema.indexes));
  writeFileSync(join(dir, "seed.sql"), genSeedSQL(schema, "reference"));
  writeFileSync(join(dir, "fixtures.sql"), genSeedSQL(schema, "fixtures"));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations, schema.derived));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
  return dir;
}

function clearSeedEnv() {
  delete process.env.DB_PATH;
  delete process.env.OPENB2C_APPLY_FIXTURES;
}

describe("seed data generation", () => {
  test("real examples expose reference data and fixtures", async () => {
    const duchy = await loadExample("duchyopera");
    const ticketing = await loadExample("ticketing");

    expect(duchy.seed?.reference.venue[0]).toMatchObject({
      id: 1,
      name: "Hall for Cornwall",
    });
    expect(duchy.seed?.fixtures.performance).toHaveLength(2);
    expect(ticketing.seed?.fixtures.issue[0]).toMatchObject({
      title: "Harden generated checkout flow",
      assignee_id: 2,
    });

    const referenceSql = genSeedSQL(duchy, "reference");
    const fixtureSql = genSeedSQL(duchy, "fixtures");
    expect(referenceSql).toContain("INSERT INTO venue");
    expect(referenceSql).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(fixtureSql).toContain("INSERT OR IGNORE INTO performance");
  });

  test("runtime applies reference data and gates fixtures", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      const referenceOnlyDir = writeGenerated(seedSchema());
      process.env.DB_PATH = join(referenceOnlyDir, "reference-only.sqlite");
      const referenceRuntime = await import(`${pathToFileURL(join(referenceOnlyDir, "runtime.ts")).href}?reference-only`);
      const reference = referenceRuntime.bootstrapRuntime();
      expect(reference.db.query("SELECT value FROM setting WHERE key = 'currency'").get()).toEqual({ value: "GBP" });
      expect(reference.db.query("SELECT count(*) AS count FROM product").get()).toEqual({ count: 0 });
      reference.db.close();

      clearSeedEnv();
      const fixturesDir = writeGenerated(seedSchema());
      process.env.DB_PATH = join(fixturesDir, "fixtures.sqlite");
      process.env.OPENB2C_APPLY_FIXTURES = "true";
      const fixtureRuntime = await import(`${pathToFileURL(join(fixturesDir, "runtime.ts")).href}?fixtures`);
      const fixtures = fixtureRuntime.bootstrapRuntime();
      expect(fixtures.db.query("SELECT name FROM product WHERE id = 1").get()).toEqual({ name: "Demo ticket" });
      fixtures.db.close();

      clearSeedEnv();
      const defaultDir = writeGenerated(seedSchema({
        seed: {
          ...seedSchema().seed!,
          applyFixturesByDefault: true,
        },
      }));
      process.env.DB_PATH = join(defaultDir, "default-fixtures.sqlite");
      const defaultRuntime = await import(`${pathToFileURL(join(defaultDir, "runtime.ts")).href}?default-fixtures`);
      const defaults = defaultRuntime.bootstrapRuntime();
      expect(defaults.db.query("SELECT name FROM product WHERE id = 1").get()).toEqual({ name: "Demo ticket" });
      defaults.db.close();
    } finally {
      clearSeedEnv();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test("validates invalid seed declarations", () => {
    const schema = seedSchema({
      seed: {
        reference: {
          ghost: [{ id: 1 }],
          product: [
            { sku: "missing-name", price_pence: 1000 },
            { id: 2, sku: 42 as any, name: "Bad SKU", price_pence: 1000 },
            { name: "No conflict key", price_pence: 1000 },
          ],
        },
        fixtures: {
          product: [
            { id: 1, sku: "bad-field", name: "Bad field", price_pence: 1000, missing: "nope" },
          ],
        },
        applyFixturesByDefault: false,
      },
    });

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "seed.reference.ghost" }),
      expect.objectContaining({ path: "seed.reference.product.0" }),
      expect.objectContaining({ path: "seed.reference.product.1.sku" }),
      expect.objectContaining({ path: "seed.reference.product.2" }),
      expect.objectContaining({ path: "seed.fixtures.product.0.missing" }),
    ]));
  });
});
