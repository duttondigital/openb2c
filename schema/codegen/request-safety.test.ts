import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
import { genRuntime } from "./runtime";
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

function writeGenerated(appSchema: Schema = schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-request-safety-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(appSchema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(appSchema.tables, appSchema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(appSchema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(appSchema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(appSchema));
  writeFileSync(join(dir, "server.ts"), genRoutes(appSchema));
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
        code: "malformed",
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

  test("responses and request logs include request and correlation IDs", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "request-ids.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (message?: unknown, ...rest: unknown[]) => {
      logs.push(String(message));
      if (rest.length) logs.push(rest.map(String).join(" "));
    };

    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const generated = await fetch(`${base}/health`);
      expect(generated.status).toBe(200);
      const generatedRequestId = generated.headers.get("x-request-id");
      expect(generatedRequestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(generated.headers.get("x-correlation-id")).toBe(generatedRequestId);

      const provided = await fetch(`${base}/api/notes`, {
        headers: {
          "x-request-id": "req-contract-123",
          "x-correlation-id": "corr-contract-456",
        },
      });
      expect(provided.status).toBe(200);
      expect(provided.headers.get("x-request-id")).toBe("req-contract-123");
      expect(provided.headers.get("x-correlation-id")).toBe("corr-contract-456");
      expect(provided.headers.get("access-control-expose-headers")).toContain("X-Request-ID");
      expect(provided.headers.get("access-control-expose-headers")).toContain("X-Correlation-ID");

      const preflight = await fetch(`${base}/api/notes`, {
        method: "OPTIONS",
        headers: {
          origin: "https://app.example",
          "access-control-request-method": "GET",
          "x-correlation-id": "corr-preflight",
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("x-correlation-id")).toBe("corr-preflight");

      const parsedLogs = logs
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is Record<string, unknown> => !!entry);

      expect(parsedLogs).toContainEqual(expect.objectContaining({
        msg: "request",
        path: "/api/notes",
        requestId: "req-contract-123",
        correlationId: "corr-contract-456",
        status: 200,
      }));
      expect(parsedLogs).toContainEqual(expect.objectContaining({
        msg: "request",
        path: "/api/notes",
        correlationId: "corr-preflight",
        status: 204,
      }));
    } finally {
      server.stop(true);
      console.log = originalLog;
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
    }
  });

  test("ops metrics aggregates completed request outcomes", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "metrics.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      await fetch(`${base}/health`);
      await fetch(`${base}/api/notes`);
      await fetch(`${base}/missing`);

      const metrics = await fetch(`${base}/ops/metrics`);
      expect(metrics.status).toBe(200);
      const body = await metrics.json() as {
        startedAt: string;
        requests: {
          total: number;
          byStatus: Record<string, number>;
          byRoute: Record<string, number>;
          durationMs: { count: number; sum: number; average: number; max: number };
        };
      };

      expect(new Date(body.startedAt).toString()).not.toBe("Invalid Date");
      expect(body.requests.total).toBe(3);
      expect(body.requests.byStatus["200"]).toBe(2);
      expect(body.requests.byStatus["404"]).toBe(1);
      expect(body.requests.byRoute["GET /health"]).toBe(1);
      expect(body.requests.byRoute["GET /api/notes"]).toBe(1);
      expect(body.requests.byRoute["GET /missing"]).toBe(1);
      expect(body.requests.durationMs.count).toBe(3);
      expect(body.requests.durationMs.max).toBeGreaterThanOrEqual(0);
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
    }
  });

  test("startup diagnostics report config, migrations, and integration status", async () => {
    const appSchema: Schema = {
      ...schema,
      integrations: {
        identityEmail: { provider: "resend", env: {} },
        emailEffects: {
          provider: "webhook",
          env: {
            EMAIL_WEBHOOK_URL: {
              description: "Email dispatch endpoint",
              requiredInProduction: true,
              secret: true,
            },
          },
        },
        payment: { provider: "stripe", env: {} },
        paymentWebhook: { provider: "openb2c", env: {} },
        webhookEffects: {
          provider: "openb2c",
          env: {},
          signing: {
            enabled: true,
            algorithm: "sha256",
            payload: "timestamp.body",
            signatureHeader: "X-OpenB2C-Signature",
            timestampHeader: "X-OpenB2C-Timestamp",
            toleranceSeconds: 300,
          },
        },
      },
    };
    const dir = writeGenerated(appSchema);
    process.env.DB_PATH = join(dir, "startup.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (message?: unknown) => {
      logs.push(String(message));
    };

    let server: { stop: (closeActiveConnections?: boolean) => void } | undefined;

    try {
      ({ server } = await import(pathToFileURL(join(dir, "server.ts")).href));
      const diagnostics = logs
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, any>;
          } catch {
            return null;
          }
        })
        .find(entry => entry?.msg === "startup diagnostics");

      expect(diagnostics).toMatchObject({
        msg: "startup diagnostics",
        app: {
          slug: "openb2c",
        },
        config: {
          dbPath: process.env.DB_PATH,
          authEnabled: false,
          production: false,
          registryMode: "ephemeral",
        },
      });
      expect(diagnostics?.migrations).toContainEqual(expect.objectContaining({
        description: "generated schema baseline",
        status: "applied",
      }));
      expect(diagnostics?.integrations).toContainEqual(expect.objectContaining({
        name: "emailEffects",
        provider: "webhook",
        env: [expect.objectContaining({
          name: "EMAIL_WEBHOOK_URL",
          requiredInProduction: true,
          secret: true,
          configured: false,
        })],
      }));
      expect(diagnostics?.env).toContainEqual(expect.objectContaining({
        name: "DB_PATH",
        requiredInProduction: true,
        secret: false,
        configured: true,
      }));
    } finally {
      server?.stop(true);
      console.log = originalLog;
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
    }
  });

  test("generated server shuts down cleanly on SIGTERM", async () => {
    const dir = writeGenerated();
    const proc = Bun.spawn([process.execPath, join(dir, "server.ts")], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DB_PATH: join(dir, "shutdown.sqlite"),
        PORT: "0",
        AUTH_ENABLED: "false",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new Response(proc.stdout).text();
    const stderr = new Response(proc.stderr).text();

    await delay(150);
    proc.kill("SIGTERM");
    const exitCode = await Promise.race([
      proc.exited,
      delay(2_000).then(() => {
        proc.kill("SIGKILL");
        return -1;
      }),
    ]);

    expect(exitCode).toBe(0);
    const out = await stdout;
    expect(out).toContain('"msg":"shutdown requested"');
    expect(out).toContain('"signal":"SIGTERM"');
    expect(out).toContain('"msg":"shutdown complete"');
    expect(await stderr).toBe("");
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
