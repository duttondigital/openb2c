// Demo MCP server — customer-facing booking tools only.
// Not generated; wraps the generated services with a curated whitelist.

import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as S from "../src/generated/services";
import * as T from "../src/generated/types";

const DB_PATH = process.env.DB_PATH || "opera.db";

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

const sql = fs.readFileSync("src/generated/schema.sql", "utf-8");
for (const stmt of sql.split(/;\s*\n/).filter((s: string) => s.trim())) {
  if (stmt.trim()) db.run(stmt);
}

const SERVER_INFO = { name: "duchy-opera-booking", version: "1.0.0" };

const TOOLS = [
  {
    name: "list_performances",
    description: "Browse upcoming opera performances",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_performance",
    description: "Get details for a specific performance (dates, venue, duration)",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "number", description: "Performance ID" } },
      required: ["id"],
    },
  },
  {
    name: "list_venues",
    description: "Browse available venues",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_venue",
    description: "Get venue details (address, capacity)",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "number", description: "Venue ID" } },
      required: ["id"],
    },
  },
  {
    name: "book_ticket",
    description: "Book a ticket for a performance. Creates or finds the customer by email, then reserves a ticket.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Customer email address" },
        name: { type: "string", description: "Customer name" },
        performance_id: { type: "number", description: "Performance to book" },
        ticket_type: { type: "string", description: "Ticket type: standard or concession", enum: ["standard", "concession"] },
      },
      required: ["email", "name", "performance_id"],
    },
  },
  {
    name: "get_ticket",
    description: "Look up a booking by ticket ID",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "number", description: "Ticket ID" } },
      required: ["id"],
    },
  },
  {
    name: "cancel_ticket",
    description: "Cancel a booking",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "number", description: "Ticket ID to cancel" } },
      required: ["id"],
    },
  },
];

const PRICE_PENCE = { standard: 2500, concession: 1500 };

function callTool(name: string, args: Record<string, unknown>): { content: { type: string; text: string }[]; isError?: boolean } {
  switch (name) {
    case "list_performances":
      return { content: [{ type: "text", text: JSON.stringify(S.findAllPerformances(db), null, 2) }] };
    case "get_performance": {
      const p = S.findPerformanceById(db, args.id as number);
      if (!p) return { content: [{ type: "text", text: "Performance not found" }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(p, null, 2) }] };
    }
    case "list_venues":
      return { content: [{ type: "text", text: JSON.stringify(S.findAllVenues(db), null, 2) }] };
    case "get_venue": {
      const v = S.findVenueById(db, args.id as number);
      if (!v) return { content: [{ type: "text", text: "Venue not found" }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(v, null, 2) }] };
    }
    case "book_ticket": {
      const customerId = S.ensureCustomer(db, args.email as string);
      S.updateCustomer(db, customerId, { name: args.name as string });
      const ticketType = (args.ticket_type as string) || "standard";
      const price = PRICE_PENCE[ticketType as keyof typeof PRICE_PENCE] ?? PRICE_PENCE.standard;
      const ticketResult = S.createTicket(db, {
        customer_id: customerId,
        performance_id: args.performance_id as number,
        price_pence: price,
        ticket_type: ticketType,
      });
      if (!ticketResult.ok) return { content: [{ type: "text", text: ticketResult.error }], isError: true };
      // Create transaction so the booking appears in the live feed
      const txResult = S.createTransaction(db, {
        customer_id: customerId,
        amount_pence: price,
        type: "purchase",
        status: "pending",
        client: "mcp",
      });
      if (txResult.ok) {
        S.createTransactionTicket(db, { transaction_id: txResult.data.id, ticket_id: ticketResult.data.id });
        S.completeTransaction(db, txResult.data.id);
      }
      const ticket = S.findTicketById(db, ticketResult.data.id);
      return { content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }] };
    }
    case "get_ticket": {
      const t = S.findTicketById(db, args.id as number);
      if (!t) return { content: [{ type: "text", text: "Ticket not found" }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(t, null, 2) }] };
    }
    case "cancel_ticket": {
      const r = S.cancelTicket(db, args.id as number);
      if (!r.ok) return { content: [{ type: "text", text: r.error }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(r.data) }] };
    }
    default:
      return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  }
}

// ── MCP protocol ────────────────────────────────────────────────────────

interface McpRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

function handleRequest(req: McpRequest) {
  switch (req.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2025-03-26",
          serverInfo: SERVER_INFO,
          capabilities: { tools: {} },
        },
      };
    case "tools/list":
      return { jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } };
    case "tools/call": {
      const { name, arguments: a = {} } = req.params as { name: string; arguments?: Record<string, unknown> };
      return { jsonrpc: "2.0", id: req.id, result: callTool(name, a) };
    }
    default:
      return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } };
  }
}

const MCP_PORT = parseInt(process.env.MCP_PORT || "3086");

if (process.argv.includes("--http")) {
  const sessions = new Map<string, boolean>();
  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };

  Bun.serve({
    port: MCP_PORT,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
      if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

      return (async () => {
        const body = await req.json() as McpRequest;
        const headers: Record<string, string> = { "Content-Type": "application/json", ...CORS_HEADERS };

        if (body.id === undefined) {
          if (body.method !== "initialize") {
            const sid = req.headers.get("Mcp-Session-Id");
            if (!sid || !sessions.has(sid)) return new Response(null, { status: 400, headers: CORS_HEADERS });
          }
          return new Response(null, { status: 202, headers: CORS_HEADERS });
        }

        if (body.method === "initialize") {
          const sid = crypto.randomUUID();
          sessions.set(sid, true);
          headers["Mcp-Session-Id"] = sid;
        } else {
          const sid = req.headers.get("Mcp-Session-Id");
          if (!sid || !sessions.has(sid)) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0", id: body.id,
              error: { code: -32600, message: "Invalid or missing session ID" },
            }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
          }
        }

        return new Response(JSON.stringify(handleRequest(body)), { headers });
      })();
    },
  });

  console.error(`Demo MCP server listening on http://localhost:${MCP_PORT}/mcp`);
} else {
  async function main() {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of Bun.stdin.stream()) {
      buffer += decoder.decode(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line) as McpRequest;
          console.log(JSON.stringify(handleRequest(req)));
        } catch {
          console.log(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
        }
      }
    }
  }
  main();
}
