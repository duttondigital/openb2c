import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { genMcpServer } from "./mcp";
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

describe("generated authorization enforcement", () => {
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

    const denied = callTool("confirm_ticket", { id: 1 }, serviceWithWriteOnly);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain("not authorized");

    const allowed = callTool("confirm_ticket", { id: 2 }, serviceWithConfirm);
    expect(allowed.isError).toBeUndefined();
    expect(JSON.parse(allowed.content[0].text)).toEqual({ id: 2, status: "confirmed" });
  });
});
