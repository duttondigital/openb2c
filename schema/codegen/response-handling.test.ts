import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genOpenAPI } from "./openapi";
import { genRuntime } from "./runtime";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Column, Operation, Schema } from "./types";

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

function op(overrides: Partial<Operation> = {}): Operation {
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, audit: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function schema(): Schema {
  return {
    organization: { name: "Response Handling", description: "Response handling test app", logo: null },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
      },
    },
    operations: {
      ticket: {
        confirm: op({
          guard: { _t: "bin", op: "==", left: { _t: "field", name: "status" }, right: { _t: "lit", value: "reserved" } },
          set: { status: "confirmed" },
        }),
      },
    },
  };
}

function writeGenerated(appSchema: Schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-response-handling-"));
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

describe("generated REST response handling", () => {
  test("OpenAPI documents structured error codes and standardized operation failures", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));

    expect(openapi.components.schemas.Error.properties.code.enum).toEqual(expect.arrayContaining([
      "not_found",
      "malformed",
      "invalid",
      "bad_state",
      "conflict",
      "internal_error",
    ]));
    expect(openapi.paths["/api/tickets"].post.responses["422"]).toBeDefined();
    expect(openapi.paths["/api/tickets/{id}"].get.responses["404"]).toBeDefined();
    expect(openapi.paths["/api/tickets/{id}/confirm"].post.responses["409"]).toBeDefined();
  });

  test("generated routes return structured 404, 409, 422, and 500 errors", async () => {
    const dir = writeGenerated(schema());
    process.env.DB_PATH = join(dir, "response-handling.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";

    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const runtime = await import(pathToFileURL(join(dir, "runtime.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const created = await fetch(`${base}/api/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      expect(created.status).toBe(201);
      await expect(created.json()).resolves.toEqual({ id: 1 });

      const missing = await fetch(`${base}/api/tickets/999`);
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toMatchObject({
        code: "not_found",
        error: "not found",
      });

      const invalid = await fetch(`${base}/api/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(invalid.status).toBe(422);
      await expect(invalid.json()).resolves.toMatchObject({
        code: "invalid",
        details: { status: "status is required" },
      });

      const wrongState = await fetch(`${base}/api/tickets/1/confirm`, { method: "POST" });
      expect(wrongState.status).toBe(409);
      await expect(wrongState.json()).resolves.toMatchObject({
        code: "bad_state",
        error: "precondition failed for confirm",
      });

      runtime.bootstrapRuntime().db.close();
      const failed = await fetch(`${base}/api/tickets`);
      expect(failed.status).toBe(500);
      await expect(failed.json()).resolves.toMatchObject({
        code: "internal_error",
        error: "internal error",
      });
    } finally {
      server.stop(true);
      clearEnv();
    }
  });
});
