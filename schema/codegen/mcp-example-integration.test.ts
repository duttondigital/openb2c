import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genEffectsInterface } from "./effects";
import { genMcpServer } from "./mcp";
import { genRuntime } from "./runtime";
import { genSeedSQL } from "./seed";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Schema } from "./types";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

type GeneratedMcp = {
  handleRequest: (req: {
    jsonrpc: "2.0";
    id: number | string;
    method: string;
    params?: Record<string, unknown>;
  }, auth?: { userId: number | null; scopes: string[] }) => Promise<{ result?: unknown }>;
  callTool: (
    name: string,
    args: Record<string, unknown>,
    auth?: { userId: number | null; scopes: string[] },
  ) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
};

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

async function loadExampleSchema(example: "duchyopera" | "ticketing"): Promise<Schema> {
  const result = await nixEvalJson(["-f", join(PROJECT_ROOT, "examples", example, "composition.nix")]);
  if (result.exitCode !== 0) {
    throw new Error(`nix eval failed for ${example}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Schema;
}

function writeGeneratedExample(schema: Schema, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `openb2c-${prefix}-mcp-`));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables, schema.indexes));
  writeFileSync(join(dir, "seed.sql"), genSeedSQL(schema, "reference"));
  writeFileSync(join(dir, "fixtures.sql"), genSeedSQL(schema, "fixtures"));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "mcp.ts"), genMcpServer(schema));
  return dir;
}

function applyEnv(values: Record<string, string>): () => void {
  const keys = Object.keys(values);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return () => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function toolByName(tools: unknown, name: string): { name: string; annotations?: Record<string, unknown>; _meta?: Record<string, unknown> } | undefined {
  return (tools as Array<{ name: string; annotations?: Record<string, unknown>; _meta?: Record<string, unknown> }>)
    .find(tool => tool.name === name);
}

describe("generated MCP example integrations", () => {
  test("Duchy Opera generated MCP lists catalog items and checks out a real fixture", async () => {
    const schema = await loadExampleSchema("duchyopera");
    const dir = writeGeneratedExample(schema, "duchy-opera");
    const dbPath = join(dir, "duchy-opera.sqlite");
    const restoreEnv = applyEnv({
      DB_PATH: dbPath,
      OPENB2C_APPLY_FIXTURES: "true",
      NODE_ENV: "test",
    });

    try {
      const mcp = await import(pathToFileURL(join(dir, "mcp.ts")).href) as GeneratedMcp;
      const auth = { userId: 1, scopes: ["*"] };

      const initialized = await mcp.handleRequest({ jsonrpc: "2.0", id: "init", method: "initialize" }, auth);
      expect(initialized.result).toMatchObject({
        serverInfo: { name: "duchy-opera" },
        capabilities: { tools: {} },
      });

      const listed = await mcp.handleRequest({ jsonrpc: "2.0", id: "tools", method: "tools/list" }, auth);
      const tools = (listed.result as { tools: unknown }).tools;
      expect(toolByName(tools, "list_commerce_catalog")).toBeDefined();
      expect(toolByName(tools, "checkout_cart")).toBeDefined();
      expect(toolByName(tools, "cancel_performance")?.annotations).toMatchObject({
        destructiveHint: true,
        openWorldHint: true,
      });
      expect(toolByName(tools, "cancel_performance")?._meta?.["openb2c/confirmation"]).toMatchObject({
        required: true,
        severity: "danger",
        title: "Cancel performance",
      });

      const catalogResult = await mcp.callTool("list_commerce_catalog", {}, auth);
      expect(catalogResult.isError).toBeUndefined();
      const catalog = JSON.parse(catalogResult.content[0].text) as {
        items: { id: number; title: string }[];
        lookups: Record<string, Record<string, string>>;
      };
      expect(catalog.items.map(item => item.title)).toEqual(["The Magic Flute"]);
      expect(catalog.lookups.venue_id["1"]).toBe("Hall for Cornwall");

      const checkoutResult = await mcp.callTool("checkout_cart", {
        client: "mcp-test",
        items: [{ item_id: 1, quantity: 2, options: { ticket_type: "standard" } }],
      }, auth);
      expect(checkoutResult.isError).toBeUndefined();
      const checkout = JSON.parse(checkoutResult.content[0].text) as {
        order_id: number;
        line_item_ids: number[];
        amount_pence: number;
        status: string;
      };
      expect(checkout.amount_pence).toBe(5000);
      expect(checkout.line_item_ids).toHaveLength(2);
      expect(checkout.status).toBe("checkout_pending");

      const db = new Database(dbPath);
      try {
        const booking = db.query<{ user_id: number; amount_pence: number }, [number]>(
          "SELECT user_id, amount_pence FROM booking WHERE id = ?",
        ).get(checkout.order_id);
        const tickets = db.query<{ status: string; price_pence: number }, [number]>(
          "SELECT status, price_pence FROM ticket WHERE id IN (SELECT ticket_id FROM booking_ticket WHERE booking_id = ?) ORDER BY id",
        ).all(checkout.order_id);
        expect(booking).toEqual({ user_id: 1, amount_pence: 5000 });
        expect(tickets).toEqual([
          { status: "reserved", price_pence: 2500 },
          { status: "reserved", price_pence: 2500 },
        ]);
      } finally {
        db.close();
      }
    } finally {
      restoreEnv();
    }
  });

  test("Ticketing generated MCP exposes issue workflow metadata and mutates fixture records", async () => {
    const schema = await loadExampleSchema("ticketing");
    const dir = writeGeneratedExample(schema, "ticketing");
    const dbPath = join(dir, "ticketing.sqlite");
    const restoreEnv = applyEnv({
      DB_PATH: dbPath,
      OPENB2C_APPLY_FIXTURES: "true",
      NODE_ENV: "test",
    });

    try {
      const mcp = await import(pathToFileURL(join(dir, "mcp.ts")).href) as GeneratedMcp;
      const auth = { userId: 1, scopes: ["*"] };

      const listed = await mcp.handleRequest({ jsonrpc: "2.0", id: "tools", method: "tools/list" }, auth);
      const tools = (listed.result as { tools: unknown }).tools;
      expect(toolByName(tools, "list_issues")).toBeDefined();
      expect(toolByName(tools, "start_issue")?.annotations).toMatchObject({
        destructiveHint: false,
        openWorldHint: true,
      });
      expect(toolByName(tools, "cancel_issue")?.annotations).toMatchObject({
        destructiveHint: true,
      });
      expect(toolByName(tools, "cancel_issue")?._meta?.["openb2c/confirmation"]).toMatchObject({
        required: true,
        severity: "warning",
        title: "Cancel issue",
      });

      const listResult = await mcp.callTool("list_issues", {
        filter: { status: "todo" },
        sort: "number",
        order: "asc",
      }, auth);
      expect(listResult.isError).toBeUndefined();
      const issues = JSON.parse(listResult.content[0].text) as {
        items: { id: number; title: string; status: string }[];
        total: number;
      };
      expect(issues.total).toBe(1);
      expect(issues.items[0]).toMatchObject({
        id: 1,
        title: "Harden generated checkout flow",
        status: "todo",
      });

      const started = await mcp.callTool("start_issue", { id: 1 }, auth);
      expect(started.isError).toBeUndefined();
      expect(JSON.parse(started.content[0].text)).toMatchObject({ id: 1, status: "in_progress" });

      const db = new Database(dbPath);
      try {
        expect(db.query<{ status: string }, []>("SELECT status FROM issue WHERE id = 1").get()).toEqual({ status: "in_progress" });
        expect(db.query<{ effect_type: string }, []>(
          "SELECT effect_type FROM openb2c_effect_attempt ORDER BY id",
        ).all()).toEqual([{ effect_type: "emit" }, { effect_type: "notify" }]);
      } finally {
        db.close();
      }
    } finally {
      restoreEnv();
    }
  });
});
