import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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
    organization: { name: "Optimistic Concurrency", description: "Concurrency test app", logo: null },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
        updated_at: col({ default: "CURRENT_TIMESTAMP" }),
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
  const dir = mkdtempSync(join(tmpdir(), "openb2c-concurrency-"));
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

describe("generated optimistic concurrency", () => {
  test("OpenAPI documents ETags and If-Match on updated_at-backed resources", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));

    expect(openapi.paths["/api/tickets/{id}"].get.responses["200"].headers.ETag).toBeDefined();
    expect(openapi.paths["/api/tickets/{id}"].put.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "If-Match", in: "header" }),
    ]));
    expect(openapi.paths["/api/tickets/{id}"].put.responses["409"]).toBeDefined();
    expect(openapi.paths["/api/tickets/{id}/confirm"].post.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "If-Match", in: "header" }),
    ]));
  });

  test("REST writes reject stale If-Match tokens and maintain updated_at", async () => {
    const dir = writeGenerated(schema());
    const dbPath = join(dir, "concurrency.sqlite");
    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";

    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const created = await fetch(`${base}/api/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "reserved" }),
      });
      expect(created.status).toBe(201);

      const read = await fetch(`${base}/api/tickets/1`);
      expect(read.status).toBe(200);
      const etag = read.headers.get("etag");
      expect(etag).toBeTruthy();

      const staleUpdate = await fetch(`${base}/api/tickets/1`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": "\"stale\"" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      expect(staleUpdate.status).toBe(409);
      await expect(staleUpdate.json()).resolves.toMatchObject({
        code: "conflict",
        error: "record has changed",
      });

      const validUpdate = await fetch(`${base}/api/tickets/1`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": etag || "" },
        body: JSON.stringify({ status: "reserved", updated_at: "1970-01-01T00:00:00Z" }),
      });
      expect(validUpdate.status).toBe(200);

      const db = new Database(dbPath);
      const updated = db.query<{ status: string; updated_at: string }, []>("SELECT status, updated_at FROM ticket WHERE id = 1").get();
      expect(updated?.status).toBe("reserved");
      expect(updated?.updated_at).not.toBe("1970-01-01T00:00:00Z");

      const beforeConcurrentChange = await fetch(`${base}/api/tickets/1`);
      const staleOperationTag = beforeConcurrentChange.headers.get("etag") || "";
      db.query("UPDATE ticket SET updated_at = ? WHERE id = 1").run("2099-01-01T00:00:00Z");
      db.close();

      const staleOperation = await fetch(`${base}/api/tickets/1/confirm`, {
        method: "POST",
        headers: { "if-match": staleOperationTag },
      });
      expect(staleOperation.status).toBe(409);

      const fresh = await fetch(`${base}/api/tickets/1`);
      const freshTag = fresh.headers.get("etag") || "";
      const validOperation = await fetch(`${base}/api/tickets/1/confirm`, {
        method: "POST",
        headers: { "if-match": freshTag },
      });
      expect(validOperation.status).toBe(200);
      await expect(validOperation.json()).resolves.toEqual({ id: 1, status: "confirmed" });

      const second = await fetch(`${base}/api/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "reserved" }),
      });
      expect(second.status).toBe(201);

      const secondRead = await fetch(`${base}/api/tickets/2`);
      const staleDeleteTag = secondRead.headers.get("etag") || "";
      const db2 = new Database(dbPath);
      db2.query("UPDATE ticket SET updated_at = ? WHERE id = 2").run("2099-01-01T00:00:00Z");
      db2.close();

      const staleDelete = await fetch(`${base}/api/tickets/2`, {
        method: "DELETE",
        headers: { "if-match": staleDeleteTag },
      });
      expect(staleDelete.status).toBe(409);

      const secondFresh = await fetch(`${base}/api/tickets/2`);
      const validDelete = await fetch(`${base}/api/tickets/2`, {
        method: "DELETE",
        headers: { "if-match": secondFresh.headers.get("etag") || "" },
      });
      expect(validDelete.status).toBe(200);
      await expect(validDelete.json()).resolves.toEqual({ deleted: true });
    } finally {
      server.stop(true);
      clearEnv();
    }
  });
});
