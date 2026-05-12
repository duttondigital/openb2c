import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
import { genOpenAPI } from "./openapi";
import { genRuntime } from "./runtime";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Operation, Relationship, Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const baseColumn = {
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

const ownerRel: Relationship = {
  field: { table: "ticket", field: "user_id", references: "user(id)" },
};

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    guard: null,
    relationships: [],
    public: false,
    scope: null,
    set: {},
    cascade: [],
    effects: [],
    ...overrides,
  };
}

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {
    user: {
      id: { ...baseColumn, type: "integer", pk: true, auto: true },
      email: { ...baseColumn, type: "text", required: true, unique: true },
      name: { ...baseColumn, type: "text", required: true },
    },
    api_key: {
      id: { ...baseColumn, type: "integer", pk: true, auto: true },
      user_id: { ...baseColumn, type: "integer", required: true, references: "user(id)" },
      key_hash: { ...baseColumn, type: "text", required: true },
      key_prefix: { ...baseColumn, type: "text", required: true },
      name: { ...baseColumn, type: "text", required: true },
      scopes: { ...baseColumn, type: "text", default: "'*'" },
      active: { ...baseColumn, type: "integer", default: "1" },
      created_at: { ...baseColumn, type: "text", default: "CURRENT_TIMESTAMP" },
      last_used_at: { ...baseColumn, type: "text" },
      expires_at: { ...baseColumn, type: "text" },
    },
    ticket: {
      id: { ...baseColumn, type: "integer", pk: true, auto: true },
      user_id: { ...baseColumn, type: "integer", required: true, references: "user(id)" },
      status: { ...baseColumn, type: "text", default: "'reserved'" },
    },
  },
  relationships: {
    ticket: {
      owner: ownerRel,
    },
  },
  operations: {
    ticket: {
      read: operation({ relationships: [ownerRel] }),
      create: operation({ relationships: [ownerRel] }),
      update: operation({ relationships: [ownerRel] }),
      delete: operation({ relationships: [ownerRel] }),
      confirm: operation({
        relationships: [ownerRel],
        policy: {
          label: "Confirm ticket",
          description: "Confirm a reserved ticket.",
          audiences: ["customer"],
          risk: "medium",
        },
        workflow: {
          audit: { summary: "Confirmed ticket" },
          confirmation: {
            required: true,
            title: "Confirm ticket",
            message: "This confirms the selected ticket.",
            confirmLabel: "Confirm ticket",
            severity: "warning",
          },
        },
        set: { status: "confirmed" },
      }),
    },
  },
};

const user1 = {
  userId: 1,
  scopes: ["ticket.read", "ticket.create", "ticket.confirm"],
} as const;

const user2 = {
  userId: 2,
  scopes: ["ticket.read", "ticket.create", "ticket.confirm"],
} as const;

const serviceWithWriteOnly = {
  userId: 1,
  scopes: ["write"],
} as const;

const serviceWithConfirm = {
  userId: 1,
  scopes: ["ticket.confirm"],
} as const;

function createDb(): Database {
  const db = new Database(":memory:");
  for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
    db.run(stmt);
  }
  seedDb(db);
  return db;
}

function seedDb(db: Database): void {
  db.query("INSERT INTO user (id, email, name) VALUES (?, ?, ?)").run(1, "user1@example.com", "User One");
  db.query("INSERT INTO user (id, email, name) VALUES (?, ?, ?)").run(2, "user2@example.com", "User Two");
  db.query("INSERT INTO ticket (id, user_id, status) VALUES (?, ?, ?)").run(1, 1, "reserved");
  db.query("INSERT INTO ticket (id, user_id, status) VALUES (?, ?, ?)").run(2, 1, "reserved");
  db.query("INSERT INTO ticket (id, user_id, status) VALUES (?, ?, ?)").run(3, 1, "reserved");
}

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-authz-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  writeFileSync(join(dir, "mcp.ts"), genMcpServer(schema));
  return dir;
}

async function seedApiKey(db: Database, id: number, userId: number, key: string, scopes: string): Promise<void> {
  const hash = await Bun.password.hash(key, { algorithm: "bcrypt", cost: 4 });
  db.query(`
    INSERT INTO api_key (id, user_id, key_hash, key_prefix, name, scopes, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, userId, hash, key.slice(0, 11), `key-${id}`, scopes);
}

async function waitForHttpServer(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url, { method: "OPTIONS" });
      if (res.status === 204 || res.status === 403) return;
    } catch {
      // Server is still starting.
    }
    await Bun.sleep(50);
  }
  throw new Error(`server did not start at ${url}`);
}

function allocatePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("ok") });
  const port = probe.port;
  probe.stop(true);
  return port;
}

function postMcp(base: string, payload: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

describe("generated authorization enforcement", () => {
  test("OpenAPI marks generated CRUD and operation endpoints as authenticated", () => {
    const openapi = JSON.parse(genOpenAPI(schema));

    expect(openapi.paths["/api/tickets"].get.security).toEqual([
      { bearerAuth: [] },
      { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
    ]);
    expect(openapi.paths["/api/tickets"].post.security).toEqual([
      { bearerAuth: [] },
      { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
    ]);
    expect(openapi.paths["/api/tickets/{id}/confirm"].post.security).toEqual([
      { bearerAuth: [] },
      { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
    ]);
    expect(openapi.paths["/api/tickets/{id}/confirm"].post.responses["403"]).toBeDefined();
  });

  test("services enforce operation scopes and record relationships", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();

    expect(services.findAllTickets(db, {}, user1).map((t: { id: number }) => t.id)).toEqual([1, 2, 3]);
    expect(services.findAllTickets(db, {}, user2)).toEqual([]);

    const created = services.createTicket(db, { status: "reserved" }, user1);
    expect(created.ok).toBe(true);
    const createdRow = db.query("SELECT user_id FROM ticket WHERE id = ?").get(created.data.id) as { user_id: number };
    expect(createdRow.user_id).toBe(1);

    const crossOwnerCreate = services.createTicket(db, { user_id: 1 }, user2);
    expect(crossOwnerCreate.ok).toBe(false);
    expect(crossOwnerCreate.code).toBe("forbidden");

    const coarseWrite = services.confirmTicket(db, 1, serviceWithWriteOnly);
    expect(coarseWrite.ok).toBe(false);
    expect(coarseWrite.code).toBe("forbidden");

    const specificScope = services.confirmTicket(db, 2, serviceWithConfirm);
    expect(specificScope.ok).toBe(true);

    const crossOwnerOperation = services.confirmTicket(db, 3, user2);
    expect(crossOwnerOperation.ok).toBe(false);
    expect(crossOwnerOperation.code).toBe("forbidden");
  });

  test("REST returns denied and allowed operation responses from generated policy", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "rest.sqlite");
    const db = new Database(dbPath);
    for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
      db.run(stmt);
    }
    seedDb(db);
    const writeKey = "do_write_only_abcdefghijklmnopqrstuvwxyz";
    const confirmKey = "do_confirm__abcdefghijklmnopqrstuvwxyz";
    await seedApiKey(db, 1, 1, writeKey, "write");
    await seedApiKey(db, 2, 1, confirmKey, "ticket.confirm");
    db.close();

    process.env.DB_PATH = dbPath;
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "true";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);

    try {
      const denied = await fetch(`http://127.0.0.1:${server.port}/api/tickets/1/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${writeKey}` },
      });
      expect(denied.status).toBe(403);

      const allowed = await fetch(`http://127.0.0.1:${server.port}/api/tickets/2/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${confirmKey}` },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ id: 2, status: "confirmed" });
    } finally {
      server.stop(true);
    }
  });

  test("MCP tools respect the same operation authorization", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "mcp.sqlite");
    const db = new Database(dbPath);
    for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
      db.run(stmt);
    }
    seedDb(db);
    db.close();

    process.env.DB_PATH = dbPath;
    const { callTool } = await import(pathToFileURL(join(dir, "mcp.ts")).href);

    const denied = await callTool("confirm_ticket", { id: 1 }, serviceWithWriteOnly);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain("not authorized");

    const allowed = await callTool("confirm_ticket", { id: 2 }, serviceWithConfirm);
    expect(allowed.isError).toBeUndefined();
    expect(JSON.parse(allowed.content[0].text)).toEqual({ id: 2, status: "confirmed" });
  });

  test("MCP tool discovery and calls respect scopes and relationship-scoped resources", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "mcp-discovery.sqlite");
    const { handleRequest, callTool } = await import(pathToFileURL(join(dir, "mcp.ts")).href);
    const namesFor = async (auth: { userId: number | null; scopes: string[] }) => {
      const res = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, auth);
      return ((res.result as { tools: { name: string }[] }).tools).map(tool => tool.name);
    };

    const readTools = await namesFor({ userId: 1, scopes: ["ticket.read"] });
    expect(readTools).toContain("list_tickets");
    expect(readTools).toContain("get_ticket");
    expect(readTools).not.toContain("create_ticket");
    expect(readTools).not.toContain("delete_ticket");
    expect(readTools).not.toContain("confirm_ticket");

    const relationshipWithoutUser = await namesFor({ userId: null, scopes: ["ticket.confirm"] });
    expect(relationshipWithoutUser).not.toContain("confirm_ticket");

    const confirmTools = await namesFor({ userId: 1, scopes: ["ticket.confirm"] });
    expect(confirmTools).toContain("confirm_ticket");
    expect(confirmTools).not.toContain("list_tickets");

    const systemTools = await namesFor({ userId: null, scopes: ["*"] });
    expect(systemTools).toEqual(expect.arrayContaining(["list_tickets", "create_ticket", "delete_ticket", "confirm_ticket"]));

    const denied = await callTool("confirm_ticket", { id: 1 }, { userId: 1, scopes: ["ticket.read"] });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain("not authorized");
  });

  test("MCP operation tools expose destructive hints and confirmation metadata", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "mcp-confirmation-metadata.sqlite");
    const { handleRequest } = await import(pathToFileURL(join(dir, "mcp.ts")).href);

    const res = await handleRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { userId: 1, scopes: ["ticket.confirm", "ticket.delete"] },
    );
    const tools = (res.result as { tools: Array<{ name: string; annotations?: unknown; _meta?: Record<string, unknown> }> }).tools;
    const confirmTool = tools.find(tool => tool.name === "confirm_ticket");
    const deleteTool = tools.find(tool => tool.name === "delete_ticket");

    expect(confirmTool?.annotations).toMatchObject({
      title: "Confirm ticket",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(confirmTool?._meta?.["openb2c/confirmation"]).toMatchObject({
      required: true,
      severity: "warning",
      title: "Confirm ticket",
      message: "This confirms the selected ticket.",
      confirmLabel: "Confirm ticket",
    });

    expect(deleteTool?.annotations).toMatchObject({
      title: "Delete Ticket record",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(deleteTool?._meta?.["openb2c/confirmation"]).toMatchObject({
      required: true,
      severity: "danger",
      title: "Delete Ticket",
      message: "This will delete the selected Ticket record.",
      confirmLabel: "Delete Ticket",
    });
  });

  test("MCP list tools support pagination, sorting, and exact-match filters", async () => {
    const dir = writeGenerated();
    const dbPath = join(dir, "mcp-list.sqlite");
    const db = new Database(dbPath);
    for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
      db.run(stmt);
    }
    seedDb(db);
    db.query("UPDATE ticket SET status = ? WHERE id = ?").run("confirmed", 3);
    db.close();

    process.env.DB_PATH = dbPath;
    const { callTool } = await import(pathToFileURL(join(dir, "mcp.ts")).href);
    const result = await callTool("list_tickets", {
      limit: 1,
      offset: 0,
      sort: "id",
      order: "desc",
      filter: { status: "reserved" },
    }, user1);

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text) as {
      items: { id: number }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.total).toBe(2);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.items.map(ticket => ticket.id)).toEqual([2]);
  });

  test("MCP transport auth keeps local stdio trusted and protects HTTP with bearer credentials", async () => {
    const mcpSource = genMcpServer(schema);
    expect(mcpSource).toContain("Stdio transport uses trusted local system auth");
    expect(mcpSource).toContain("const res = await handleRequest(req, MCP_AUTH_CONTEXT);");
    expect(mcpSource).toContain("Content-Type, Mcp-Session-Id, Authorization");
    expect(mcpSource).toContain("const sessionAuth = await S.verifyIdentitySession(db, token);");
    expect(mcpSource).toContain("return sessionAuth || (SUPPORTS_API_KEYS ? await S.verifyApiKey(db, token) : null);");

    const dir = writeGenerated();

    const stdioDbPath = join(dir, "mcp-stdio.sqlite");
    const stdioDb = new Database(stdioDbPath);
    for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
      stdioDb.run(stmt);
    }
    seedDb(stdioDb);
    stdioDb.close();

    const stdio = Bun.spawn([process.execPath, join(dir, "mcp.ts")], {
      env: {
        ...process.env,
        DB_PATH: stdioDbPath,
        NODE_ENV: "test",
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    stdio.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: "stdio-confirm",
      method: "tools/call",
      params: { name: "confirm_ticket", arguments: { id: 1 } },
    }) + "\n");
    stdio.stdin.end();
    const stdioOutput = await new Response(stdio.stdout).text();
    expect(await stdio.exited).toBe(0);
    const stdioResponses = stdioOutput
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((line) => line.id === "stdio-confirm");
    expect(stdioResponses).toHaveLength(1);
    expect(stdioResponses[0].result.isError).toBeUndefined();
    expect(JSON.parse(stdioResponses[0].result.content[0].text)).toEqual({ id: 1, status: "confirmed" });

    const dbPath = join(dir, "mcp-http.sqlite");
    const db = new Database(dbPath);
    for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
      db.run(stmt);
    }
    seedDb(db);
    const key = "do_mcp_http_abcdefghijklmnopqrstuvwxyz";
    await seedApiKey(db, 1, 1, key, "ticket.read");
    db.close();

    const port = allocatePort();
    const base = `http://127.0.0.1:${port}/mcp`;
    const proc = Bun.spawn([process.execPath, join(dir, "mcp.ts"), "--http"], {
      env: {
        ...process.env,
        DB_PATH: dbPath,
        MCP_PORT: String(port),
        MCP_HTTP_AUTH_ENABLED: "true",
        NODE_ENV: "test",
      },
      stdout: "ignore",
      stderr: "pipe",
    });

    try {
      await waitForHttpServer(base);

      const initialized = await postMcp(base, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      expect(initialized.status).toBe(200);
      const sessionId = initialized.headers.get("Mcp-Session-Id");
      expect(sessionId).toBeTruthy();

      const unauthenticated = await postMcp(
        base,
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_tickets", arguments: {} } },
        { "Mcp-Session-Id": sessionId! },
      );
      expect(unauthenticated.status).toBe(401);
      expect(await unauthenticated.json()).toMatchObject({
        error: { code: -32001, message: "Authentication required" },
      });

      const invalid = await postMcp(
        base,
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_tickets", arguments: {} } },
        { "Mcp-Session-Id": sessionId!, Authorization: "Bearer do_invalid" },
      );
      expect(invalid.status).toBe(401);

      const allowed = await postMcp(
        base,
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_tickets", arguments: {} } },
        { "Mcp-Session-Id": sessionId!, Authorization: `Bearer ${key}` },
      );
      expect(allowed.status).toBe(200);
      const body = await allowed.json() as { result: { content: { text: string }[] } };
      const listResult = JSON.parse(body.result.content[0].text) as { items: { id: number }[]; total: number };
      expect(listResult.items.map(ticket => ticket.id)).toEqual([1, 2, 3]);
      expect(listResult.total).toBe(3);
    } finally {
      proc.kill();
      await proc.exited.catch(() => null);
    }
  });
});
