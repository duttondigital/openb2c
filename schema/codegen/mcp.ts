import type { Column, Operation, Schema } from "./types";
import { getAppMetadata, hasCommerceWorkflow, hasCommerceBookingAliases, pascalCase, camelCase } from "./utils";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bApi\b/g, "API");
}

function fieldLabel(field: string, col: Column): string {
  if (col.relationship?.label) return col.relationship.label;
  if (col.metadata?.label) return col.metadata.label;
  if (field === "id") return "ID";
  if (field.endsWith("_id")) return titleCase(field.slice(0, -3));
  if (field.endsWith("_pence")) return `${titleCase(field.slice(0, -6))} GBP`;
  return titleCase(field);
}

function keyFieldSummary(cols: Record<string, Column>): string | null {
  const fields = Object.entries(cols)
    .map(([name, col], index) => ({ name, col, index, priority: col.metadata?.displayPriority ?? Number.POSITIVE_INFINITY }))
    .filter(({ col }) => !col.pk && !col.metadata?.redact && col.metadata?.privacy !== "secret")
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, 5)
    .map(({ name, col }) => fieldLabel(name, col));

  return fields.length ? `Key fields: ${fields.join(", ")}` : null;
}

function sentence(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function toolDescription(
  action: string,
  op: Operation | undefined,
  fallback: string,
  cols?: Record<string, Column>,
): string {
  const label = op?.policy?.label;
  const description = op?.policy?.description;
  const workflowSummary = op?.workflow?.audit?.summary;
  const confirmation = op?.workflow?.confirmation;
  const parts: string[] = [];

  if (label && description) {
    parts.push(`${label}. ${description}`);
  } else if (description) {
    parts.push(description);
  } else if (label) {
    parts.push(label);
  } else {
    parts.push(fallback);
  }

  if (workflowSummary && !parts.some(part => part.includes(workflowSummary))) {
    parts.push(`Workflow: ${workflowSummary}`);
  }

  if (confirmation?.required) {
    parts.push(`Requires confirmation: ${confirmation.confirmLabel || confirmation.title || label || action}`);
  }

  if (cols) {
    const summary = keyFieldSummary(cols);
    if (summary) parts.push(summary);
  }

  return parts.map(part => sentence(part)).filter(Boolean).join(" ");
}

export function genMcpServer(schema: Schema): string {
  const app = getAppMetadata(schema);
  const entities = Object.keys(schema.tables);
  const tools: string[] = [];
  const handlers: string[] = [];

  for (const entity of entities) {
    const Entity = pascalCase(entity);
    const cols = schema.tables[entity];
    const ops = schema.operations[entity] || {};
    const createRelationshipFields = new Set(
      (ops.create?.relationships ?? [])
        .filter(rel => rel.field.table === entity)
        .map(rel => rel.field.field)
    );

    // Input properties for create/update
    const inputProps: Record<string, { type: string; description: string }> = {};
    const requiredProps: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      if (c.pk && c.auto) continue;
      inputProps[col] = {
        type: c.type === "integer" ? "number" : "string",
        description: col.replace(/_/g, " "),
      };
      if (c.required && c.default === null && !createRelationshipFields.has(col)) requiredProps.push(col);
    }

    // List tool
    const listDescription = toolDescription("read", ops.read, `List ${titleCase(entity)} records`, cols);
    tools.push(`    {
      name: "list_${entity}s",
      description: ${JSON.stringify(listDescription)},
      inputSchema: { type: "object", properties: {} },
    }`);
    handlers.push(`      case "list_${entity}s":
        const list${Entity}Authz = S.authorizeCollection("${entity}", "read", auth);
        if (!list${Entity}Authz.ok) return { content: [{ type: "text", text: list${Entity}Authz.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(S.findAll${Entity}s(db, {}, auth), null, 2) }] };`);

    // Get tool
    const getDescription = toolDescription("read", ops.read, `Get a ${titleCase(entity)} record by ID`, cols);
    tools.push(`    {
      name: "get_${entity}",
      description: ${JSON.stringify(getDescription)},
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "${entity} ID" } },
        required: ["id"],
      },
    }`);
    handlers.push(`      case "get_${entity}":
        const get${Entity}Authz = S.authorizeCollection("${entity}", "read", auth);
        if (!get${Entity}Authz.ok) return { content: [{ type: "text", text: get${Entity}Authz.error }], isError: true };
        const ${entity} = S.find${Entity}ById(db, args.id as number, auth);
        if (!${entity}) return { content: [{ type: "text", text: "Not found" }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(${entity}, null, 2) }] };`);

    // Create tool
    const createDescription = toolDescription("create", ops.create, `Create a ${titleCase(entity)} record`, cols);
    tools.push(`    {
      name: "create_${entity}",
      description: ${JSON.stringify(createDescription)},
      inputSchema: {
        type: "object",
        properties: ${JSON.stringify(inputProps)},
        required: ${JSON.stringify(requiredProps)},
      },
    }`);
    handlers.push(`      case "create_${entity}":
        const create${Entity}Result = S.create${Entity}(db, args as T.${Entity}Input, auth, { source: "mcp" });
        if (!create${Entity}Result.ok) return { content: [{ type: "text", text: create${Entity}Result.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(create${Entity}Result.data) }] };`);

    // Delete tool
    const deleteDescription = toolDescription("delete", ops.delete, `Delete a ${titleCase(entity)} record`, cols);
    tools.push(`    {
      name: "delete_${entity}",
      description: ${JSON.stringify(deleteDescription)},
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "${entity} ID" } },
        required: ["id"],
      },
    }`);
    handlers.push(`      case "delete_${entity}":
        const delete${Entity}Result = S.delete${Entity}(db, args.id as number, auth, null, { source: "mcp" });
        if (!delete${Entity}Result.ok) return { content: [{ type: "text", text: delete${Entity}Result.error }], isError: true };
        return { content: [{ type: "text", text: "Deleted" }] };`);

    // Custom operations
    for (const opName of Object.keys(ops).filter(op => !CRUD_ACTIONS.has(op))) {
      const OpName = camelCase(opName);
      const operationDescription = toolDescription(opName, ops[opName], `${titleCase(opName)} ${titleCase(entity)} record`);
      tools.push(`    {
      name: "${opName}_${entity}",
      description: ${JSON.stringify(operationDescription)},
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "${entity} ID" } },
        required: ["id"],
      },
    }`);
      handlers.push(`      case "${opName}_${entity}":
        const ${OpName}${Entity}Result = S.${OpName}${Entity}(db, args.id as number, auth, null, { source: "mcp" });
        if (!${OpName}${Entity}Result.ok) return { content: [{ type: "text", text: ${OpName}${Entity}Result.error }], isError: true };
        await FX.dispatchEffects(db, ${OpName}${Entity}Result.effects || [], {
          source: "mcp",
          operation: "${entity}.${opName}",
          entity: "${entity}",
          recordId: args.id as number,
          result: ${OpName}${Entity}Result.data,
        });
        return { content: [{ type: "text", text: JSON.stringify(${OpName}${Entity}Result.data) }] };`);
    }
  }

  if (hasCommerceWorkflow(schema)) {
    tools.push(`    {
      name: "list_commerce_catalog",
      description: "List configured ecommerce catalog items",
      inputSchema: { type: "object", properties: {} },
    }`);
    handlers.push(`      case "list_commerce_catalog":
        const commerceCatalogResult = S.listCommerceCatalog(db);
        if (!commerceCatalogResult.ok) return { content: [{ type: "text", text: commerceCatalogResult.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(commerceCatalogResult.data, null, 2) }] };`);

    tools.push(`    {
      name: "checkout_cart",
      description: "Checkout a configured ecommerce cart",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "user ID" },
          client: { type: "string", description: "checkout client" },
          items: {
            type: "array",
            description: "configured cart items",
            items: {
              type: "object",
              properties: {
                item_id: { type: "number", description: "catalog item ID" },
                quantity: { type: "number", description: "quantity" },
                options: { type: "object", description: "line item options" },
              },
              required: ["item_id"],
            },
          },
        },
        required: ["items"],
      },
    }`);
    handlers.push(`      case "checkout_cart":
        const checkoutCartResult = S.checkoutCommerceCart(db, args as S.CommerceCheckoutInput, auth);
        if (!checkoutCartResult.ok) return { content: [{ type: "text", text: checkoutCartResult.error }], isError: true };
        await FX.dispatchEffects(db, checkoutCartResult.effects || [], {
          source: "mcp",
          operation: "commerce.checkout",
          entity: "commerce_order",
          recordId: checkoutCartResult.data.order_id,
          result: checkoutCartResult.data,
        });
        return { content: [{ type: "text", text: JSON.stringify(checkoutCartResult.data) }] };`);

    tools.push(`    {
      name: "create_order_payment_intent",
      description: "Create a payment intent for a commerce order",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "number", description: "order ID" } },
        required: ["order_id"],
      },
    }`);
    handlers.push(`      case "create_order_payment_intent":
        const orderPaymentIntentResult = S.createCommercePaymentIntent(db, args.order_id as number, auth);
        if (!orderPaymentIntentResult.ok) return { content: [{ type: "text", text: orderPaymentIntentResult.error }], isError: true };
        await FX.dispatchEffects(db, orderPaymentIntentResult.effects || [], {
          source: "mcp",
          operation: "commerce.create_payment_intent",
          entity: "commerce_order",
          recordId: orderPaymentIntentResult.data.order_id,
          result: orderPaymentIntentResult.data,
        });
        return { content: [{ type: "text", text: JSON.stringify(orderPaymentIntentResult.data) }] };`);

    tools.push(`    {
      name: "expire_commerce_orders",
      description: "Expire stale commerce orders",
      inputSchema: { type: "object", properties: {} },
    }`);
    handlers.push(`      case "expire_commerce_orders":
        if (!S.hasScope(auth, "commerce.expire") && !S.hasScope(auth, "*")) return { content: [{ type: "text", text: "forbidden" }], isError: true };
        const expireCommerceOrdersResult = S.expireCommerceOrders(db);
        if (!expireCommerceOrdersResult.ok) return { content: [{ type: "text", text: expireCommerceOrdersResult.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(expireCommerceOrdersResult.data) }] };`);

    if (hasCommerceBookingAliases(schema)) {
    tools.push(`    {
      name: "reserve_booking",
      description: "Reserve tickets for checkout",
      inputSchema: {
        type: "object",
        properties: {
          performance_id: { type: "number", description: "performance ID" },
          user_id: { type: "number", description: "user ID" },
          quantity: { type: "number", description: "number of tickets" },
          ticket_type: { type: "string", description: "ticket type" },
          client: { type: "string", description: "booking client" },
        },
        required: ["performance_id"],
      },
    }`);
    handlers.push(`      case "reserve_booking":
        const reserveBookingResult = S.reserveBooking(db, args as S.ReserveBookingInput, auth);
        if (!reserveBookingResult.ok) return { content: [{ type: "text", text: reserveBookingResult.error }], isError: true };
        await FX.dispatchEffects(db, reserveBookingResult.effects || [], {
          source: "mcp",
          operation: "commerce.reserve_booking",
          entity: "booking",
          recordId: reserveBookingResult.data.booking_id,
          result: reserveBookingResult.data,
        });
        return { content: [{ type: "text", text: JSON.stringify(reserveBookingResult.data) }] };`);

    tools.push(`    {
      name: "create_booking_payment_intent",
      description: "Create a payment intent for a booking",
      inputSchema: {
        type: "object",
        properties: { booking_id: { type: "number", description: "booking ID" } },
        required: ["booking_id"],
      },
    }`);
    handlers.push(`      case "create_booking_payment_intent":
        const paymentIntentResult = S.createPaymentIntentForBooking(db, args.booking_id as number, auth);
        if (!paymentIntentResult.ok) return { content: [{ type: "text", text: paymentIntentResult.error }], isError: true };
        await FX.dispatchEffects(db, paymentIntentResult.effects || [], {
          source: "mcp",
          operation: "commerce.create_payment_intent",
          entity: "booking",
          recordId: paymentIntentResult.data.booking_id,
          result: paymentIntentResult.data,
        });
        return { content: [{ type: "text", text: JSON.stringify(paymentIntentResult.data) }] };`);

    tools.push(`    {
      name: "expire_checkout_bookings",
      description: "Expire stale checkout bookings",
      inputSchema: { type: "object", properties: {} },
    }`);
    handlers.push(`      case "expire_checkout_bookings":
        if (!S.hasScope(auth, "booking.expire") && !S.hasScope(auth, "*")) return { content: [{ type: "text", text: "forbidden" }], isError: true };
        const expireCheckoutBookingsResult = S.expireCheckoutBookings(db);
        if (!expireCheckoutBookingsResult.ok) return { content: [{ type: "text", text: expireCheckoutBookingsResult.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(expireCheckoutBookingsResult.data) }] };`);
    }
  }

  return `// Generated by schema/codegen.ts — do not edit
// MCP Server for ${app.name}

import * as FX from "./effects";
import { APP_CONFIG, PRODUCTION, bootstrapRuntime } from "./runtime";
import * as S from "./services";
import * as T from "./types";

const { db } = bootstrapRuntime();

const SERVER_INFO = {
  name: APP_CONFIG.slug,
  version: APP_CONFIG.version,
};

const MCP_AUTH_CONTEXT = T.SYSTEM_AUTH_CONTEXT;
const MCP_HTTP_AUTH_ENABLED = process.env.MCP_HTTP_AUTH_ENABLED !== "false";

const TOOLS = [
${tools.join(",\n")}
];

interface McpRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export async function handleRequest(req: McpRequest, auth: T.AuthContext = MCP_AUTH_CONTEXT): Promise<McpResponse> {
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
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: { tools: TOOLS },
      };

    case "tools/call": {
      const { name, arguments: args = {} } = req.params as { name: string; arguments?: Record<string, unknown> };
      const result = await callTool(name, args, auth);
      return {
        jsonrpc: "2.0",
        id: req.id,
        result,
      };
    }

    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: "Method not found" },
      };
  }
}

export async function callTool(name: string, args: Record<string, unknown>, auth: T.AuthContext = MCP_AUTH_CONTEXT): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  switch (name) {
${handlers.join("\n")}
    default:
      return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  }
}

const MCP_PORT = parseInt(process.env.MCP_PORT || String(APP_CONFIG.defaultPorts.mcp), 10);

if (import.meta.main) {
if (process.argv.includes("--http")) {
  // Streamable HTTP transport (MCP 2025-03-26)
  const sessions = new Map<string, boolean>();

  const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map(o => o.trim()).filter(Boolean);
  const CORS_ALLOW_CREDENTIALS = process.env.CORS_ALLOW_CREDENTIALS === "true";
  const ALLOW_WILDCARD_CORS = process.env.ALLOW_WILDCARD_CORS === "true";
  const CORS_ALLOW_METHODS = "POST, OPTIONS";
  const CORS_ALLOW_HEADERS = "Content-Type, Mcp-Session-Id, Authorization";

  function allowedCorsOrigin(req: Request): string | null {
    const origin = req.headers.get("origin");
    if (CORS_ORIGINS.includes("*")) {
      return CORS_ALLOW_CREDENTIALS ? origin : "*";
    }
    return origin && CORS_ORIGINS.includes(origin) ? origin : null;
  }

  function corsHeaders(req: Request): Headers {
    const headers = new Headers();
    const origin = allowedCorsOrigin(req);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    if (origin && CORS_ALLOW_CREDENTIALS && origin !== "*") {
      headers.set("Access-Control-Allow-Credentials", "true");
    }
    headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
    headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
    headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
    headers.set("Vary", "Origin");
    return headers;
  }

  function applyCors(req: Request, res: Response): Response {
    for (const [k, v] of corsHeaders(req)) {
      res.headers.set(k, v);
    }
    return res;
  }

  function preflightResponse(req: Request): Response {
    if (req.headers.has("origin") && !allowedCorsOrigin(req)) {
      return applyCors(req, Response.json({ error: "origin not allowed", code: "forbidden" }, { status: 403 }));
    }
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  async function authenticateHttpRequest(req: Request): Promise<T.AuthContext | null> {
    if (!MCP_HTTP_AUTH_ENABLED) return MCP_AUTH_CONTEXT;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);
    return (await S.verifyIdentitySession(db, token)) || (await S.verifyApiKey(db, token));
  }

  function authenticationRequiredResponse(body: McpRequest, headers: Headers): Response {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32001, message: "Authentication required" },
    }), { status: 401, headers });
  }

  if (PRODUCTION && CORS_ORIGINS.includes("*") && !ALLOW_WILDCARD_CORS) {
    throw new Error("CORS_ORIGINS must be explicit in production or ALLOW_WILDCARD_CORS=true must be set");
  }

  Bun.serve({
    port: MCP_PORT,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/mcp") {
        return applyCors(req, new Response("Not found", { status: 404 }));
      }

      if (req.method === "OPTIONS") {
        return preflightResponse(req);
      }

      if (req.method !== "POST") {
        return applyCors(req, new Response("Method not allowed", { status: 405 }));
      }

      return (async () => {
        const body = await req.json() as McpRequest;

        const headers = corsHeaders(req);
        headers.set("Content-Type", "application/json");
        let auth: T.AuthContext = MCP_AUTH_CONTEXT;

        // JSON-RPC notifications have no id — acknowledge with 202
        if (body.id === undefined) {
          // Still validate session for non-initialize notifications
          if (body.method !== "initialize") {
            const sessionId = req.headers.get("Mcp-Session-Id");
            if (!sessionId || !sessions.has(sessionId)) {
              return new Response(null, { status: 400, headers: corsHeaders(req) });
            }
            const notificationAuth = await authenticateHttpRequest(req);
            if (!notificationAuth) {
              return new Response(null, { status: 401, headers: corsHeaders(req) });
            }
          }
          return new Response(null, { status: 202, headers: corsHeaders(req) });
        }

        if (body.method === "initialize") {
          const sessionId = crypto.randomUUID();
          sessions.set(sessionId, true);
          headers.set("Mcp-Session-Id", sessionId);
        } else {
          const sessionId = req.headers.get("Mcp-Session-Id");
          if (!sessionId || !sessions.has(sessionId)) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              error: { code: -32600, message: "Invalid or missing session ID" },
            }), { status: 400, headers });
          }
          const requestAuth = await authenticateHttpRequest(req);
          if (!requestAuth) return authenticationRequiredResponse(body, headers);
          auth = requestAuth;
        }

        const res = await handleRequest(body, auth);
        return new Response(JSON.stringify(res), { headers });
      })();
    },
  });

  console.error(\`MCP HTTP server listening on http://localhost:\${MCP_PORT}/mcp\`);
} else {
  // Stdio transport uses trusted local system auth.
  async function main() {
    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of Bun.stdin.stream()) {
      buffer += decoder.decode(chunk);

      const lines = buffer.split("\\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line) as McpRequest;
          const res = await handleRequest(req, MCP_AUTH_CONTEXT);
          console.log(JSON.stringify(res));
        } catch (e) {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }));
        }
      }
    }
  }

  main();
}
}
`;
}
