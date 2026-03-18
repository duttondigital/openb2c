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

// ── Seat map (must match demo/index.html) ───────────────────────────────
const ROWS = "ABCDEF";
const COLS = 10;
const BASE_PRICE_PENCE = 2500;
const TIER: Record<string, { type: string; mult: number; label: string }> = {
  A: { type: "premium", mult: 1.5, label: "Premium" },
  B: { type: "premium", mult: 1.5, label: "Premium" },
  C: { type: "standard", mult: 1, label: "Standard" },
  D: { type: "standard", mult: 1, label: "Standard" },
  E: { type: "rear", mult: 0.7, label: "Rear" },
  F: { type: "rear", mult: 0.7, label: "Rear" },
};

const ALL_SEATS: string[] = [];
for (const row of ROWS) {
  for (let c = 1; c <= COLS; c++) ALL_SEATS.push(`${row}${c}`);
}

function seatPrice(seat: string): number {
  const tier = TIER[seat[0]];
  return Math.round(BASE_PRICE_PENCE * (tier?.mult ?? 1));
}

function takenSeats(performanceId: number): Set<string> {
  const tickets = S.findAllTickets(db, { filter: { performance_id: performanceId } });
  const taken = new Set<string>();
  for (const t of tickets) {
    if ((t as any).status !== "cancelled" && (t as any).seat) taken.add((t as any).seat);
  }
  return taken;
}

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
    name: "available_seats",
    description: "Show available seats for a performance, grouped by tier with prices",
    inputSchema: {
      type: "object" as const,
      properties: { performance_id: { type: "number", description: "Performance ID" } },
      required: ["performance_id"],
    },
  },
  {
    name: "book_tickets",
    description: "Book specific seats for a performance. Use available_seats first to see what's free.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Customer email address" },
        name: { type: "string", description: "Customer name" },
        performance_id: { type: "number", description: "Performance to book" },
        seats: { type: "array", items: { type: "string" }, description: "Seat labels to book, e.g. [\"A1\", \"A2\"]" },
      },
      required: ["email", "name", "performance_id", "seats"],
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
    case "available_seats": {
      const perfId = args.performance_id as number;
      const p = S.findPerformanceById(db, perfId);
      if (!p) return { content: [{ type: "text", text: "Performance not found" }], isError: true };
      const taken = takenSeats(perfId);
      const available: Record<string, { seats: string[]; price: string }> = {};
      for (const seat of ALL_SEATS) {
        if (taken.has(seat)) continue;
        const tier = TIER[seat[0]];
        if (!available[tier.label]) available[tier.label] = { seats: [], price: `£${(seatPrice(seat) / 100).toFixed(2)}` };
        available[tier.label].seats.push(seat);
      }
      return { content: [{ type: "text", text: JSON.stringify({ performance_id: perfId, total_available: ALL_SEATS.length - taken.size, tiers: available }, null, 2) }] };
    }
    case "book_tickets": {
      const seats = args.seats as string[];
      if (!seats || seats.length === 0) return { content: [{ type: "text", text: "At least one seat is required" }], isError: true };
      if (seats.length > 10) return { content: [{ type: "text", text: "Maximum 10 seats per booking" }], isError: true };
      const perfId = args.performance_id as number;
      const p = S.findPerformanceById(db, perfId);
      if (!p) return { content: [{ type: "text", text: "Performance not found" }], isError: true };
      // Validate seats
      for (const s of seats) {
        if (!ALL_SEATS.includes(s)) return { content: [{ type: "text", text: `Invalid seat: ${s}` }], isError: true };
      }
      const taken = takenSeats(perfId);
      const clashes = seats.filter(s => taken.has(s));
      if (clashes.length > 0) return { content: [{ type: "text", text: `Seats already taken: ${clashes.join(", ")}` }], isError: true };
      // Create customer
      const customerId = S.ensureCustomer(db, args.email as string);
      S.updateCustomer(db, customerId, { name: args.name as string });
      // Create tickets with seat assignments
      let totalPence = 0;
      const ticketIds: number[] = [];
      for (const seat of seats) {
        const price = seatPrice(seat);
        totalPence += price;
        const r = S.createTicket(db, {
          customer_id: customerId,
          performance_id: perfId,
          price_pence: price,
          ticket_type: TIER[seat[0]].type,
          seat,
        });
        if (!r.ok) return { content: [{ type: "text", text: r.error }], isError: true };
        ticketIds.push(r.data.id);
      }
      // Single transaction
      const txResult = S.createTransaction(db, {
        customer_id: customerId,
        amount_pence: totalPence,
        type: "purchase",
        status: "pending",
        client: "mcp",
      });
      if (txResult.ok) {
        for (const tid of ticketIds) {
          S.createTransactionTicket(db, { transaction_id: txResult.data.id, ticket_id: tid });
        }
        S.completeTransaction(db, txResult.data.id);
      }
      const tickets = ticketIds.map(id => S.findTicketById(db, id));
      return { content: [{ type: "text", text: JSON.stringify({ tickets, total: `£${(totalPence / 100).toFixed(2)}`, transaction_id: txResult.ok ? txResult.data.id : null }, null, 2) }] };
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
