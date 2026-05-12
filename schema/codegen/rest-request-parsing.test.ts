import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genRuntime } from "./runtime";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Column, Schema } from "./types";

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

function schema(): Schema {
  return {
    organization: { name: "Request Parsing", description: "Request parsing test app", logo: null },
    tables: {
      note: {
        id: col({ type: "integer", pk: true, auto: true }),
        title: col({ required: true, validation: { minLength: 3 } }),
        priority: col({ type: "integer", required: true, validation: { minimum: 1, maximum: 5 } }),
        status: col({ required: true, validation: { enum: ["todo", "done"] } }),
        url: col({ metadata: { format: "url" } }),
      },
    },
    operations: {},
  };
}

function writeGenerated(appSchema: Schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-request-parsing-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(appSchema.tables, appSchema.indexes));
  writeFileSync(join(dir, "types.ts"), genTypes(appSchema.tables, appSchema.operations, appSchema.derived));
  writeFileSync(join(dir, "services.ts"), genServices(appSchema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(appSchema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(appSchema));
  writeFileSync(join(dir, "server.ts"), genRoutes(appSchema));
  return dir;
}

function clearEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.AUTH_ENABLED;
}

describe("generated REST request parsing", () => {
  test("generates endpoint-specific request schemas", () => {
    const server = genRoutes(schema());
    expect(server).toContain("const REQUEST_SCHEMAS");
    expect(server).toContain("readTypedJson<T.NoteInput>(req, signal, REQUEST_SCHEMAS[\"note\"].create)");
    expect(server).toContain("readTypedJson<Partial<T.NoteInput>>(req, signal, REQUEST_SCHEMAS[\"note\"].update, { partial: true })");
    expect(server).toContain("\"priority\"");
    expect(server).toContain("\"minimum\": 1");
  });

  test("rejects malformed endpoint bodies before service execution", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const dir = writeGenerated(schema());
    process.env.DB_PATH = join(dir, "request-parsing.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";

    try {
      const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
      const base = `http://127.0.0.1:${server.port}`;

      const wrongType = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: 123, priority: 2, status: "todo" }),
      });
      expect(wrongType.status).toBe(400);
      await expect(wrongType.json()).resolves.toMatchObject({
        code: "invalid",
        details: { title: "title must be a string" },
      });

      const unknownField = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Typed note", priority: 2, status: "todo", extra: true }),
      });
      expect(unknownField.status).toBe(400);
      await expect(unknownField.json()).resolves.toMatchObject({
        details: { extra: "field is not allowed" },
      });

      const invalidRule = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "No", priority: 9, status: "blocked" }),
      });
      expect(invalidRule.status).toBe(400);
      await expect(invalidRule.json()).resolves.toMatchObject({
        details: {
          title: "title must be at least 3 characters",
          priority: "priority must be at most 5",
          status: "status must be one of: todo, done",
        },
      });

      const valid = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Typed note", priority: 2, status: "todo", url: "https://example.test" }),
      });
      expect(valid.status).toBe(201);
      await expect(valid.json()).resolves.toEqual({ id: 1 });

      const partial = await fetch(`${base}/api/notes/1`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      expect(partial.status).toBe(200);
      await expect(partial.json()).resolves.toEqual({ id: 1 });

      server.stop(true);
    } finally {
      clearEnv();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
