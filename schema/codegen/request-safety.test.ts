import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {
    note: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      title: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
    },
  },
  operations: {},
};

const TEST_REGISTRY_PUBLIC_KEY = "a".repeat(64);

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-request-safety-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

function clearGeneratedServerEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.AUTH_ENABLED;
  delete process.env.CORS_ORIGINS;
  delete process.env.REGISTRY_PRIVATE_KEY;
  delete process.env.REGISTRY_PUBLIC_KEY;
  delete process.env.ALLOW_INSECURE_AUTH_DISABLED;
  delete process.env.ALLOW_WILDCARD_CORS;
  delete process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS;
}

describe("generated request safety", () => {
  test("JSON endpoints enforce body limits, content type, and malformed JSON errors", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "request-safety.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.MAX_REQUEST_BODY_BYTES = "64";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const valid = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "ok" }),
      });
      expect(valid.status).toBe(201);

      const tooLarge = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x".repeat(100) }),
      });
      expect(tooLarge.status).toBe(413);
      expect(await tooLarge.json()).toMatchObject({
        code: "payload_too_large",
        error: "request body too large",
      });

      const wrongContentType = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ title: "ok" }),
      });
      expect(wrongContentType.status).toBe(415);
      expect(await wrongContentType.json()).toMatchObject({
        code: "unsupported_media_type",
        error: "content-type must be application/json",
      });

      const malformed = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"title":',
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({
        code: "invalid",
        error: "malformed JSON",
      });
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
      delete process.env.MAX_REQUEST_BODY_BYTES;
    }
  });

  test("list endpoints clamp pagination limits and offsets", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "pagination.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.MAX_PAGE_LIMIT = "2";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      for (const title of ["one", "two", "three"]) {
        const created = await fetch(`${base}/api/notes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        });
        expect(created.status).toBe(201);
      }

      const response = await fetch(`${base}/api/notes?limit=9999&offset=-20`);
      expect(response.status).toBe(200);
      const body = await response.json() as { items: unknown[]; total: number; limit: number; offset: number };
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(0);
      expect(body.total).toBe(3);
      expect(body.items).toHaveLength(2);
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
      delete process.env.MAX_PAGE_LIMIT;
    }
  });

  test("route handlers time out slow request work without completing the write", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "timeout.sqlite");
    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.ROUTE_TIMEOUT_MS = "10";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const encoder = new TextEncoder();
      let cancelled = false;
      let sentFirstChunk = false;
      const slowBody = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (!sentFirstChunk) {
            sentFirstChunk = true;
            controller.enqueue(encoder.encode('{"title":"'));
            return;
          }
          await delay(75);
          if (cancelled) return;
          controller.enqueue(encoder.encode('late"}'));
          controller.close();
        },
        cancel() {
          cancelled = true;
        },
      });

      const timedOut = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: slowBody,
        duplex: "half",
      });
      expect(timedOut.status).toBe(504);
      expect(await timedOut.json()).toMatchObject({
        code: "timeout",
        error: "request timed out",
      });

      await delay(100);
      const db = new Database(dbPath);
      const row = db.query<{ total: number }, []>("SELECT COUNT(*) as total FROM note").get();
      db.close();
      expect(row?.total).toBe(0);
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
      delete process.env.ROUTE_TIMEOUT_MS;
    }
  });

  test("CORS origins are configured instead of always wildcarded", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "cors.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.CORS_ORIGINS = "https://admin.example,https://app.example";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const allowed = await fetch(`${base}/health`, {
        headers: { origin: "https://admin.example" },
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("access-control-allow-origin")).toBe("https://admin.example");
      expect(allowed.headers.get("vary")).toBe("Origin");

      const disallowed = await fetch(`${base}/health`, {
        headers: { origin: "https://evil.example" },
      });
      expect(disallowed.status).toBe(200);
      expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();

      const allowedPreflight = await fetch(`${base}/api/notes`, {
        method: "OPTIONS",
        headers: {
          origin: "https://app.example",
          "access-control-request-method": "POST",
        },
      });
      expect(allowedPreflight.status).toBe(204);
      expect(allowedPreflight.headers.get("access-control-allow-origin")).toBe("https://app.example");

      const disallowedPreflight = await fetch(`${base}/api/notes`, {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "POST",
        },
      });
      expect(disallowedPreflight.status).toBe(403);
      expect(disallowedPreflight.headers.get("access-control-allow-origin")).toBeNull();
      expect(await disallowedPreflight.json()).toMatchObject({
        code: "forbidden",
        error: "origin not allowed",
      });
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
      delete process.env.CORS_ORIGINS;
    }
  });

  test("MCP HTTP transport uses the same configurable CORS policy", () => {
    const mcp = genMcpServer(schema);

    expect(mcp).toContain("const CORS_ORIGINS = (process.env.CORS_ORIGINS || \"*\")");
    expect(mcp).toContain("function allowedCorsOrigin(req: Request): string | null");
    expect(mcp).toContain("return preflightResponse(req);");
    expect(mcp).toContain("if (PRODUCTION && CORS_ORIGINS.includes(\"*\") && !ALLOW_WILDCARD_CORS)");
    expect(mcp).toContain("origin not allowed");
    expect(mcp).not.toContain("\"Access-Control-Allow-Origin\": \"*\"");
  });

  test("production mode refuses insecure REST defaults", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      let dir = writeGenerated();
      process.env.DB_PATH = join(dir, "prod-auth.sqlite");
      process.env.PORT = "0";
      process.env.AUTH_ENABLED = "false";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.REGISTRY_PUBLIC_KEY = TEST_REGISTRY_PUBLIC_KEY;
      await expect(import(pathToFileURL(join(dir, "server.ts")).href)).rejects.toThrow("AUTH_ENABLED=false");

      clearGeneratedServerEnv();
      dir = writeGenerated();
      process.env.DB_PATH = join(dir, "prod-cors.sqlite");
      process.env.PORT = "0";
      process.env.REGISTRY_PUBLIC_KEY = TEST_REGISTRY_PUBLIC_KEY;
      await expect(import(pathToFileURL(join(dir, "server.ts")).href)).rejects.toThrow("CORS_ORIGINS must be explicit");

      clearGeneratedServerEnv();
      dir = writeGenerated();
      process.env.DB_PATH = join(dir, "prod-registry.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      await expect(import(pathToFileURL(join(dir, "server.ts")).href)).rejects.toThrow("REGISTRY_PRIVATE_KEY or REGISTRY_PUBLIC_KEY");

      clearGeneratedServerEnv();
      dir = writeGenerated();
      process.env.DB_PATH = join(dir, "prod-valid.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.REGISTRY_PUBLIC_KEY = TEST_REGISTRY_PUBLIC_KEY;
      const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
      try {
        const health = await fetch(`http://127.0.0.1:${server.port}/health`, {
          headers: { origin: "https://app.example" },
        });
        expect(health.status).toBe(200);
        expect(health.headers.get("access-control-allow-origin")).toBe("https://app.example");
      } finally {
        server.stop(true);
      }

      clearGeneratedServerEnv();
      dir = writeGenerated();
      process.env.DB_PATH = join(dir, "prod-ephemeral-allowed.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS = "true";
      const allowedEphemeral = await import(pathToFileURL(join(dir, "server.ts")).href);
      allowedEphemeral.server.stop(true);
    } finally {
      clearGeneratedServerEnv();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
