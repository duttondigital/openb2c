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
import type { Column, Schema } from "./types";
import { SYSTEM_DEFAULT_VERSION } from "./utils";

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
    organization: { name: "API Versioning", description: "API versioning test app", logo: null },
    tables: {
      note: {
        id: col({ type: "integer", pk: true, auto: true }),
        title: col({ required: true }),
      },
    },
    operations: {},
  };
}

function writeGenerated(appSchema: Schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-api-versioning-"));
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

describe("generated REST API versioning", () => {
  test("OpenAPI exposes the generated versioning strategy", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));

    expect(openapi.info.version).toBe(SYSTEM_DEFAULT_VERSION);
    expect(openapi["x-openb2c-api-versioning"]).toMatchObject({
      current: SYSTEM_DEFAULT_VERSION,
      requestHeader: "X-OpenB2C-API-Version",
      responseHeader: "X-OpenB2C-API-Version",
    });
    expect(openapi.components.schemas.Error.properties.code.enum).toContain("unsupported_version");
  });

  test("server returns and negotiates the generated API version", async () => {
    const dir = writeGenerated(schema());
    process.env.DB_PATH = join(dir, "api-versioning.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";

    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200);
      expect(health.headers.get("x-openb2c-api-version")).toBe(SYSTEM_DEFAULT_VERSION);
      await expect(health.json()).resolves.toMatchObject({ version: SYSTEM_DEFAULT_VERSION });

      const current = await fetch(`${base}/api/notes`, {
        headers: { "x-openb2c-api-version": SYSTEM_DEFAULT_VERSION },
      });
      expect(current.status).toBe(200);
      expect(current.headers.get("x-openb2c-api-version")).toBe(SYSTEM_DEFAULT_VERSION);

      const unsupported = await fetch(`${base}/api/notes`, {
        headers: { "x-openb2c-api-version": "9.9.9" },
      });
      expect(unsupported.status).toBe(400);
      expect(unsupported.headers.get("x-openb2c-api-version")).toBe(SYSTEM_DEFAULT_VERSION);
      await expect(unsupported.json()).resolves.toMatchObject({
        code: "unsupported_version",
        details: {
          requested: "9.9.9",
          supported: SYSTEM_DEFAULT_VERSION,
        },
      });
    } finally {
      server.stop(true);
      clearEnv();
    }
  });
});
