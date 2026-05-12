import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
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
    organization: { name: "Audit Logging", description: "Audit logging test app", logo: null },
    audit: {
      entities: {
        ticket: {
          operations: ["create", "update", "delete"],
          category: "workflow",
          reason: "Tickets are customer entitlements.",
        },
      },
    },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
      },
    },
    operations: {
      ticket: {
        cancel: op({
          audit: {
            required: true,
            category: "payment",
            reason: "Cancellation can affect refunds.",
          },
          set: { status: "cancelled" },
        }),
        touch: op({ set: { status: "touched" } }),
      },
    },
  };
}

function writeGenerated(appSchema: Schema): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-audit-logging-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(appSchema.tables, appSchema.indexes));
  writeFileSync(join(dir, "types.ts"), genTypes(appSchema.tables, appSchema.operations, appSchema.derived));
  writeFileSync(join(dir, "services.ts"), genServices(appSchema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(appSchema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(appSchema));
  writeFileSync(join(dir, "server.ts"), genRoutes(appSchema));
  writeFileSync(join(dir, "mcp.ts"), genMcpServer(appSchema));
  return dir;
}

type AuditRow = {
  entity: string;
  action: string;
  record_id: number | null;
  category: string;
  reason: string | null;
  actor_user_id: number | null;
  source: string;
  result_json: string;
};

function auditRows(dbPath: string): AuditRow[] {
  const db = new Database(dbPath);
  const rows = db.query<AuditRow, []>(`
    SELECT entity, action, record_id, category, reason, actor_user_id, source, result_json
    FROM openb2c_audit_log
    ORDER BY id
  `).all();
  db.close();
  return rows;
}

function clearEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.AUTH_ENABLED;
}

describe("generated audit logging", () => {
  test("REST writes persist audit entries required by audit metadata", async () => {
    const dir = writeGenerated(schema());
    const dbPath = join(dir, "audit-rest.sqlite");
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

      const updated = await fetch(`${base}/api/tickets/1`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "reserved-updated" }),
      });
      expect(updated.status).toBe(200);

      const cancelled = await fetch(`${base}/api/tickets/1/cancel`, { method: "POST" });
      expect(cancelled.status).toBe(200);

      const unaudited = await fetch(`${base}/api/tickets/1/touch`, { method: "POST" });
      expect(unaudited.status).toBe(200);

      const deleted = await fetch(`${base}/api/tickets/1`, { method: "DELETE" });
      expect(deleted.status).toBe(200);

      const rows = auditRows(dbPath);
      expect(rows.map(row => row.action)).toEqual(["create", "update", "cancel", "delete"]);
      expect(rows.every(row => row.entity === "ticket")).toBe(true);
      expect(rows.every(row => row.record_id === 1)).toBe(true);
      expect(rows.every(row => row.source === "rest")).toBe(true);
      expect(rows[0]).toMatchObject({
        category: "workflow",
        reason: "Tickets are customer entitlements.",
        actor_user_id: null,
      });
      expect(rows[2]).toMatchObject({
        category: "payment",
        reason: "Cancellation can affect refunds.",
      });
      expect(JSON.parse(rows[0].result_json)).toEqual({ id: 1 });
      expect(JSON.parse(rows[3].result_json)).toEqual({ deleted: true });
    } finally {
      server.stop(true);
      clearEnv();
    }
  });

  test("MCP writes use the same audit metadata", async () => {
    const dir = writeGenerated(schema());
    const dbPath = join(dir, "audit-mcp.sqlite");
    process.env.DB_PATH = dbPath;

    try {
      const { callTool } = await import(pathToFileURL(join(dir, "mcp.ts")).href);
      const created = await callTool("create_ticket", { status: "reserved" });
      expect(created.isError).toBeUndefined();
      const cancelled = await callTool("cancel_ticket", { id: 1 });
      expect(cancelled.isError).toBeUndefined();

      const rows = auditRows(dbPath);
      expect(rows.map(row => [row.action, row.source])).toEqual([
        ["create", "mcp"],
        ["cancel", "mcp"],
      ]);
    } finally {
      delete process.env.DB_PATH;
    }
  });
});
