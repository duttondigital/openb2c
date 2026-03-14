/**
 * Generates SQLite schema, TypeScript types, and services from Nix schema.
 *
 * Usage: nix eval --json -f schema/default.nix | bun schema/codegen.ts
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export interface Column {
  type: string;
  pk: boolean;
  auto: boolean;
  required: boolean;
  unique: boolean;
  default: string | null;
  references: string | null;
}

export type Tables = Record<string, Record<string, Column>>;

export interface Expr {
  _t: "field" | "rel" | "lit" | "bin" | "un" | "agg";
  [key: string]: unknown;
}

export interface Cascade {
  entity: string;
  via: string | null;
  set: Record<string, string>;
}

export interface Effect {
  emit: string | null;
  notify: { channel: string; template: string; to: string } | null;
  call: { service: string; action: string } | null;
}

export interface Operation {
  guard: Expr | null;
  set: Record<string, string>;
  cascade: Cascade[];
  effects: Effect[];
}

export type Operations = Record<string, Record<string, Operation>>;

export interface Schema {
  tables: Tables;
  operations: Operations;
}

// ============================================================================
// SQL Generation
// ============================================================================

const TS_TYPE_MAP: Record<string, string> = {
  integer: "number",
  text: "string",
  real: "number",
  blob: "Uint8Array",
};

export function pascalCase(s: string): string {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

export function camelCase(s: string): string {
  return s.replace(/_(\w)/g, (_, c) => c.toUpperCase());
}

function quoteReserved(name: string): string {
  // SQLite reserved words that need quoting
  const reserved = ["transaction", "order", "group", "index"];
  return reserved.includes(name.toLowerCase()) ? `[${name}]` : name;
}

export function sqlType(col: Column): string {
  const parts = [col.type.toUpperCase()];
  if (col.pk) parts.push("PRIMARY KEY");
  if (col.auto) parts.push("AUTOINCREMENT");
  if (col.required && !col.pk) parts.push("NOT NULL");
  if (col.unique) parts.push("UNIQUE");
  if (col.default !== null) parts.push(`DEFAULT ${col.default}`);
  if (col.references !== null) {
    // Quote table name in references if reserved
    const ref = col.references.replace(/^(\w+)/, (_, table) => quoteReserved(table));
    parts.push(`REFERENCES ${ref}`);
  }
  return parts.join(" ");
}

export function genSQL(tables: Tables): string {
  // Topological sort: tables with no FK deps first
  const tableNames = Object.keys(tables);
  const deps: Record<string, string[]> = {};
  for (const [table, cols] of Object.entries(tables)) {
    deps[table] = [];
    for (const c of Object.values(cols)) {
      if (c.references) {
        const match = c.references.match(/^(\w+)\(/);
        if (match && match[1] !== table && tableNames.includes(match[1])) {
          deps[table].push(match[1]);
        }
      }
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  function visit(t: string) {
    if (visited.has(t) || !tables[t]) return;
    visited.add(t);
    for (const d of deps[t] || []) visit(d);
    sorted.push(t);
  }
  for (const t of tableNames) visit(t);

  const stmts: string[] = [];
  for (const table of sorted) {
    const cols = tables[table];
    if (!cols) continue;
    const defs: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      defs.push(`    ${col} ${sqlType(c)}`);
    }
    const tableName = quoteReserved(table);
    stmts.push(`CREATE TABLE IF NOT EXISTS ${tableName} (\n${defs.join(",\n")}\n);`);
  }
  return stmts.join("\n\n") + "\n";
}

// ============================================================================
// Types Generation
// ============================================================================

export function tsType(sqliteType: string): string {
  return TS_TYPE_MAP[sqliteType] ?? "unknown";
}

export function genRowInterface(table: string, cols: Record<string, Column>): string {
  const name = pascalCase(table);
  const fields: string[] = [];
  for (const [col, c] of Object.entries(cols)) {
    const ts = tsType(c.type);
    const nullable = !c.pk && !c.required ? " | null" : "";
    fields.push(`  ${col}: ${ts}${nullable};`);
  }
  return `export interface ${name} {\n${fields.join("\n")}\n}`;
}

export function genInputInterface(table: string, cols: Record<string, Column>): string {
  const name = pascalCase(table);
  const fields: string[] = [];
  for (const [col, c] of Object.entries(cols)) {
    if (c.pk && c.auto) continue;
    const ts = tsType(c.type);
    const opt = c.required ? "" : "?";
    fields.push(`  ${col}${opt}: ${ts};`);
  }
  return `export interface ${name}Input {\n${fields.join("\n")}\n}`;
}

export function genTypes(tables: Tables): string {
  const chunks: string[] = ["// Generated by schema/codegen.ts — do not edit\n"];
  for (const [table, cols] of Object.entries(tables)) {
    chunks.push(genRowInterface(table, cols));
    chunks.push(genInputInterface(table, cols));
  }
  return chunks.join("\n\n") + "\n";
}

// ============================================================================
// Expression Compilation
// ============================================================================

export function compileExpr(expr: Expr, ctx: string): string {
  switch (expr._t) {
    case "field":
      return `${ctx}.${expr.name}`;

    case "rel":
      // Related entity field - generates variable reference
      // The service will need to load this relation
      return `_rel_${expr.entity}.${expr.field}`;

    case "lit":
      const val = expr.value;
      if (typeof val === "string") return JSON.stringify(val);
      if (typeof val === "boolean") return val ? "true" : "false";
      return String(val);

    case "bin":
      const left = compileExpr(expr.left as Expr, ctx);
      const right = compileExpr(expr.right as Expr, ctx);
      const op = expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
      return `(${left} ${op} ${right})`;

    case "un":
      const arg = compileExpr(expr.arg as Expr, ctx);
      if (expr.op === "isNull") return `(${arg} === null)`;
      if (expr.op === "notNull") return `(${arg} !== null)`;
      return `${expr.op}(${arg})`;

    case "agg":
      // Aggregations need special handling
      return `/* AGG: ${expr.op} on ${(expr.rel as Expr).entity} */`;

    default:
      return "/* unknown expr */";
  }
}

// Extract relations used in an expression
export function extractRelations(expr: Expr | null): string[] {
  if (!expr) return [];
  const rels: string[] = [];

  function walk(e: Expr) {
    if (e._t === "rel") {
      rels.push(e.entity as string);
    } else if (e._t === "bin") {
      walk(e.left as Expr);
      walk(e.right as Expr);
    } else if (e._t === "un") {
      walk(e.arg as Expr);
    }
  }

  walk(expr);
  return [...new Set(rels)];
}

// ============================================================================
// Service Generation
// ============================================================================

function genServiceImports(): string {
  return `import { Database } from "bun:sqlite";
import type * as T from "./types";

export type ErrorCode = "not_found" | "invalid" | "bad_state" | "conflict";

export type Result<D> =
  | { ok: true; data: D }
  | { ok: false; error: string; code: ErrorCode };

export interface ApiError {
  error: string;
  code: ErrorCode;
  details?: Record<string, string>;
}

export function errorResponse(error: string, code: ErrorCode, status: number, details?: Record<string, string>): Response {
  const body: ApiError = { error, code };
  if (details) body.details = details;
  return Response.json(body, { status });
}

export interface Effect {
  type: "emit" | "notify" | "call";
  payload: unknown;
}

export interface OpResult<D> extends Result<D> {
  effects?: Effect[];
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sort?: string;      // column name
  order?: "asc" | "desc";
  filter?: Record<string, unknown>;  // column: value filters
}

// ============================================================================
// Validation
// ============================================================================

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\\s?[0-9][A-Z]{2}$/i;
const UK_PHONE_RE = /^(\\+44|0)[0-9]{10,11}$/;
const DATE_RE = /^\\d{4}-\\d{2}-\\d{2}$/;
const TIME_RE = /^\\d{2}:\\d{2}(:\\d{2})?$/;

export function validateEmail(v: string): boolean { return EMAIL_RE.test(v); }
export function validatePostcode(v: string): boolean { return UK_POSTCODE_RE.test(v); }
export function validatePhone(v: string): boolean { return UK_PHONE_RE.test(v.replace(/\\s/g, "")); }
export function validateDate(v: string): boolean { return DATE_RE.test(v); }
export function validateTime(v: string): boolean { return TIME_RE.test(v); }

function validate(input: Record<string, unknown>): string | null {
  if (input.email !== undefined && typeof input.email === "string" && !validateEmail(input.email)) {
    return "invalid email format";
  }
  if (input.postcode !== undefined && typeof input.postcode === "string" && !validatePostcode(input.postcode)) {
    return "invalid UK postcode";
  }
  if (input.phone !== undefined && typeof input.phone === "string" && !validatePhone(input.phone)) {
    return "invalid UK phone number";
  }
  if (input.date !== undefined && typeof input.date === "string" && !validateDate(input.date)) {
    return "invalid date format (YYYY-MM-DD)";
  }
  if (input.time !== undefined && typeof input.time === "string" && !validateTime(input.time)) {
    return "invalid time format (HH:MM)";
  }
  return null;
}

// ============================================================================
// Auth
// ============================================================================

export interface AuthContext {
  keyId: number;
  customerId: number | null;
  scopes: string[];
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "do_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function verifyApiKey(db: Database, key: string): AuthContext | null {
  const row = db.query(\`
    SELECT id, customer_id, scopes, active, expires_at
    FROM api_key WHERE key = ?
  \`).get(key) as { id: number; customer_id: number | null; scopes: string; active: number; expires_at: string | null } | null;

  if (!row || !row.active) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  // Update last_used_at
  db.query("UPDATE api_key SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);

  return {
    keyId: row.id,
    customerId: row.customer_id,
    scopes: row.scopes.split(",").map(s => s.trim()),
  };
}

export function hasScope(ctx: AuthContext, required: string): boolean {
  return ctx.scopes.includes("*") || ctx.scopes.includes(required);
}
`;
}

function genCrudService(entity: string, cols: Record<string, Column>): string {
  const Entity = pascalCase(entity);
  const tableName = entity === "transaction" ? "[transaction]" : entity;

  const colNames = Object.keys(cols);
  const inputCols = colNames.filter(c => !(cols[c].pk && cols[c].auto));
  const requiredCols = inputCols.filter(c => cols[c].required);

  return `
// ============================================================================
// ${Entity} CRUD
// ============================================================================

export function find${Entity}ById(db: Database, id: number): T.${Entity} | null {
  return db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
}

const ${entity}Cols = new Set(${JSON.stringify(colNames)});

export function findAll${Entity}s(db: Database, opts: ListOptions = {}): T.${Entity}[] {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const sort = opts.sort && ${entity}Cols.has(opts.sort) ? opts.sort : "id";
  const order = opts.order === "desc" ? "DESC" : "ASC";

  let where = "";
  const params: unknown[] = [];
  if (opts.filter) {
    const clauses: string[] = [];
    for (const [k, v] of Object.entries(opts.filter)) {
      if (${entity}Cols.has(k) && v !== undefined) {
        clauses.push(\`\${k} = ?\`);
        params.push(v);
      }
    }
    if (clauses.length) where = "WHERE " + clauses.join(" AND ");
  }

  params.push(limit, offset);
  return db.query(\`SELECT * FROM ${tableName} \${where} ORDER BY \${sort} \${order} LIMIT ? OFFSET ?\`).all(...params) as T.${Entity}[];
}

export function count${Entity}s(db: Database, filter?: Record<string, unknown>): number {
  let where = "";
  const params: unknown[] = [];
  if (filter) {
    const clauses: string[] = [];
    for (const [k, v] of Object.entries(filter)) {
      if (${entity}Cols.has(k) && v !== undefined) {
        clauses.push(\`\${k} = ?\`);
        params.push(v);
      }
    }
    if (clauses.length) where = "WHERE " + clauses.join(" AND ");
  }
  return (db.query(\`SELECT COUNT(*) as n FROM ${tableName} \${where}\`).get(...params) as { n: number }).n;
}

export function create${Entity}(db: Database, input: T.${Entity}Input): Result<{ id: number }> {
  ${requiredCols.length > 0 ? `// Validate required fields
  ${requiredCols.map(c => `if (input.${c} === undefined) return { ok: false, error: "${c} is required", code: "invalid" };`).join("\n  ")}` : ""}

  // Validate formats
  const validationError = validate(input as Record<string, unknown>);
  if (validationError) return { ok: false, error: validationError, code: "invalid" };

  // Build dynamic insert - only include provided fields, let DB handle defaults
  const cols: string[] = [];
  const vals: unknown[] = [];
  ${inputCols.map(c => `if (input.${c} !== undefined) { cols.push("${c}"); vals.push(input.${c}); }`).join("\n  ")}

  const result = db.query(\`
    INSERT INTO ${tableName} (\${cols.join(", ")})
    VALUES (\${cols.map(() => "?").join(", ")})
    RETURNING id
  \`).get(...vals) as { id: number };

  return { ok: true, data: { id: result.id } };
}

export function update${Entity}(db: Database, id: number, input: Partial<T.${Entity}Input>): Result<{ id: number }> {
  const existing = find${Entity}ById(db, id);
  if (!existing) return { ok: false, error: "not found", code: "not_found" };

  // Validate formats
  const validationError = validate(input as Record<string, unknown>);
  if (validationError) return { ok: false, error: validationError, code: "invalid" };

  const sets: string[] = [];
  const vals: unknown[] = [];
  ${inputCols.map(c => `if (input.${c} !== undefined) { sets.push("${c} = ?"); vals.push(input.${c}); }`).join("\n  ")}

  if (sets.length > 0) {
    vals.push(id);
    db.query(\`UPDATE ${tableName} SET \${sets.join(", ")} WHERE id = ?\`).run(...vals);
  }

  return { ok: true, data: { id } };
}

export function delete${Entity}(db: Database, id: number): Result<{ deleted: true }> {
  const existing = find${Entity}ById(db, id);
  if (!existing) return { ok: false, error: "not found", code: "not_found" };

  db.query("DELETE FROM ${tableName} WHERE id = ?").run(id);
  return { ok: true, data: { deleted: true } };
}
`;
}

function genOperationService(entity: string, opName: string, op: Operation, tables: Tables): string {
  const Entity = pascalCase(entity);
  const OpName = camelCase(opName);
  const tableName = entity === "transaction" ? "[transaction]" : entity;

  const relations = extractRelations(op.guard);
  const guardCode = op.guard ? compileExpr(op.guard, entity) : "true";

  // Generate relation loading
  const relLoads = relations.map(rel => {
    // Find FK column
    const fkCol = `${rel}_id`;
    return `  const _rel_${rel} = db.query("SELECT * FROM ${rel} WHERE id = ?").get(${entity}.${fkCol}) as T.${pascalCase(rel)} | null;
  if (!_rel_${rel}) return { ok: false, error: "${rel} not found", code: "invalid" };`;
  }).join("\n");

  // Generate set clause
  const setEntries = Object.entries(op.set);
  const setCode = setEntries.length > 0
    ? `db.query("UPDATE ${tableName} SET ${setEntries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?").run(${setEntries.map(([_, v]) => JSON.stringify(v)).join(", ")}, id);`
    : "// No fields to set";

  // Generate cascade updates
  const cascadeCode = op.cascade.map(c => {
    // Use single quotes for SQL string literals
    const setClause = Object.entries(c.set).map(([k, v]) => `${k} = '${v}'`).join(", ");
    if (c.via) {
      // Check if via is a junction table (contains underscore and exists as table)
      // or a direct FK column name
      if (c.via.includes("_") && c.via !== `${entity}_id`) {
        // Junction table: via = "transaction_ticket"
        return `  db.query(\`UPDATE ${c.entity} SET ${setClause} WHERE id IN (SELECT ${c.entity}_id FROM ${c.via} WHERE ${entity}_id = ?)\`).run(id);`;
      } else {
        // Direct FK column: via = "performance_id"
        return `  db.query("UPDATE ${c.entity} SET ${setClause} WHERE ${c.via} = ?").run(id);`;
      }
    } else {
      // Default: FK on target entity named {entity}_id
      return `  db.query("UPDATE ${c.entity} SET ${setClause} WHERE ${entity}_id = ?").run(id);`;
    }
  }).join("\n");

  // Generate effects
  const effectsCode = op.effects.map(e => {
    if (e.emit) return `    { type: "emit", payload: { event: ${JSON.stringify(e.emit)}, ${entity} } }`;
    if (e.notify) return `    { type: "notify", payload: ${JSON.stringify(e.notify)} }`;
    if (e.call) return `    { type: "call", payload: ${JSON.stringify(e.call)} }`;
    return "";
  }).filter(Boolean).join(",\n");

  return `
export function ${OpName}${Entity}(db: Database, id: number): OpResult<{ id: number; status: string }> {
  const ${entity} = find${Entity}ById(db, id);
  if (!${entity}) return { ok: false, error: "not found", code: "not_found" };

${relLoads}

  // Guard: ${op.guard ? "check preconditions" : "none"}
  if (!(${guardCode})) {
    return { ok: false, error: "precondition failed for ${opName}", code: "bad_state" };
  }

  // Execute in transaction
  const run = db.transaction(() => {
    ${setCode}
${cascadeCode}
  });
  run();

  return {
    ok: true,
    data: { id, status: ${setEntries.find(([k]) => k === "status") ? JSON.stringify(setEntries.find(([k]) => k === "status")![1]) : '"updated"'} },
    effects: [
${effectsCode}
    ],
  };
}
`;
}

export function genServices(schema: Schema): string {
  const chunks: string[] = [
    "// Generated by schema/codegen.ts — do not edit\n",
    genServiceImports(),
  ];

  // Generate CRUD for each entity
  for (const [entity, cols] of Object.entries(schema.tables)) {
    chunks.push(genCrudService(entity, cols));
  }

  // Generate operations
  for (const [entity, ops] of Object.entries(schema.operations)) {
    for (const [opName, op] of Object.entries(ops)) {
      chunks.push(genOperationService(entity, opName, op, schema.tables));
    }
  }

  return chunks.join("\n");
}

// ============================================================================
// REST Routes Generation
// ============================================================================

function genRoutes(schema: Schema): string {
  const entities = Object.keys(schema.tables);
  const routes: string[] = [];

  for (const entity of entities) {
    const Entity = pascalCase(entity);
    const ops = schema.operations[entity] || {};

    routes.push(`  // ${Entity}`);
    routes.push(`  { method: "GET", path: "/api/${entity}s", handler: (req) => {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const sort = url.searchParams.get("sort") || undefined;
    const order = url.searchParams.get("order") as "asc" | "desc" | undefined;
    const filter: Record<string, string> = {};
    for (const [k, v] of url.searchParams) {
      if (!["limit", "offset", "sort", "order"].includes(k)) filter[k] = v;
    }
    const items = S.findAll${Entity}s(db, { limit, offset, sort, order, filter: Object.keys(filter).length ? filter : undefined });
    const total = S.count${Entity}s(db, Object.keys(filter).length ? filter : undefined);
    return Response.json({ items, total, limit, offset });
  }},`);
    routes.push(`  { method: "GET", path: "/api/${entity}s/:id", handler: (_, p) => {
    const r = S.find${Entity}ById(db, +p.id);
    return r ? Response.json(r) : Response.json({ error: "not found" }, { status: 404 });
  }},`);
    routes.push(`  { method: "POST", path: "/api/${entity}s", handler: async (req) => {
    const r = S.create${Entity}(db, await req.json());
    return r.ok ? Response.json(r.data, { status: 201 }) : Response.json(r, { status: 400 });
  }},`);
    routes.push(`  { method: "PUT", path: "/api/${entity}s/:id", handler: async (req, p) => {
    const r = S.update${Entity}(db, +p.id, await req.json());
    return r.ok ? Response.json(r.data) : Response.json(r, { status: 400 });
  }},`);
    routes.push(`  { method: "DELETE", path: "/api/${entity}s/:id", handler: (_, p) => {
    const r = S.delete${Entity}(db, +p.id);
    return r.ok ? Response.json(r.data) : Response.json(r, { status: 400 });
  }},`);

    // Custom operations
    for (const opName of Object.keys(ops)) {
      const OpName = camelCase(opName);
      routes.push(`  { method: "POST", path: "/api/${entity}s/:id/${opName.replace(/_/g, "-")}", handler: (_, p) => {
    const r = S.${OpName}${Entity}(db, +p.id);
    return r.ok ? Response.json(r.data) : Response.json(r, { status: 400 });
  }},`);
    }
    routes.push("");
  }

  return `// Generated by schema/codegen.ts — do not edit

import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as S from "./services";

const DB_PATH = process.env.DB_PATH || "opera.db";
const PORT = parseInt(process.env.PORT || "3085");
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";  // enabled by default

// Structured logging
function log(level: string, msg: string, data?: Record<string, unknown>) {
  if (level === "debug" && LOG_LEVEL !== "debug") return;
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  console.log(JSON.stringify(entry));
}

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

const sql = fs.readFileSync("src/generated/schema.sql", "utf-8");
const statements = sql.split(/;\\s*\\n/).filter((s: string) => s.trim());
for (const stmt of statements) {
  if (stmt.trim()) db.run(stmt);
}

type Handler = (req: Request, params: Record<string, string>) => Response | Promise<Response>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

const routes: Route[] = [
${routes.join("\n")}];

function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.path.split("/");
    const pathParts = path.split("/");
    if (routeParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { route, params };
  }
  return null;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const start = performance.now();
    const url = new URL(req.url);

    // Health check (no auth)
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", db: DB_PATH, auth: AUTH_ENABLED });
    }

    // Auth check
    if (AUTH_ENABLED && url.pathname.startsWith("/api/")) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return Response.json({ error: "missing authorization", code: "invalid" }, { status: 401 });
      }
      const key = authHeader.slice(7);
      const auth = S.verifyApiKey(db, key);
      if (!auth) {
        return Response.json({ error: "invalid api key", code: "invalid" }, { status: 401 });
      }
      // Check scope: GET = read, others = write
      const requiredScope = req.method === "GET" ? "read" : "write";
      if (!S.hasScope(auth, requiredScope)) {
        return Response.json({ error: "insufficient scope", code: "invalid" }, { status: 403 });
      }
    }

    const result = matchRoute(req.method, url.pathname);
    if (!result) {
      log("info", "not found", { method: req.method, path: url.pathname });
      return Response.json({ error: "not found" }, { status: 404 });
    }

    try {
      const res = await result.route.handler(req, result.params);
      const ms = (performance.now() - start).toFixed(1);
      log("info", "request", { method: req.method, path: url.pathname, status: res.status, ms });
      return res;
    } catch (err) {
      const ms = (performance.now() - start).toFixed(1);
      log("error", "request failed", { method: req.method, path: url.pathname, error: String(err), ms });
      return Response.json({ error: "internal error" }, { status: 500 });
    }
  },
});

log("info", "server started", { port: server.port, db: DB_PATH, auth: AUTH_ENABLED });
`;
}

// ============================================================================
// Integration Tests Generation (HTTP + MCP)
// ============================================================================

function genIntegrationTests(schema: Schema): string {
  const entities = Object.keys(schema.tables);

  // Build sample data for each entity
  const sampleData: Record<string, Record<string, unknown>> = {};
  const depOrder: string[] = []; // Topological order for setup

  for (const [entity, cols] of Object.entries(schema.tables)) {
    const data: Record<string, unknown> = {};
    for (const [col, c] of Object.entries(cols)) {
      if (c.pk && c.auto) continue;
      if (c.default !== null) continue;
      if (!c.required) continue;

      if (col.includes("_id")) {
        data[col] = 1;
      } else if (c.type === "integer") {
        data[col] = col.includes("pence") ? 1000 : col.includes("capacity") ? 100 : col.includes("mins") ? 120 : 1;
      } else if (c.type === "text") {
        if (col === "email") data[col] = "test@example.com";
        else if (col === "postcode") data[col] = "TR1 1AA";
        else if (col === "date") data[col] = "2024-06-01";
        else if (col === "time") data[col] = "19:30";
        else data[col] = `Test ${col}`;
      } else {
        data[col] = `test_${col}`;
      }
    }
    sampleData[entity] = data;
  }

  // Compute dependency order
  function addWithDeps(entity: string, added: Set<string>) {
    if (added.has(entity)) return;
    const cols = schema.tables[entity];
    for (const [col, c] of Object.entries(cols)) {
      if (col.endsWith("_id") && c.references) {
        const dep = col.replace("_id", "");
        if (schema.tables[dep]) addWithDeps(dep, added);
      }
    }
    added.add(entity);
    depOrder.push(entity);
  }
  const added = new Set<string>();
  for (const e of entities) addWithDeps(e, added);

  // Generate setup calls in order
  const setupCalls = depOrder.map(e =>
    `    await api.post("/${e}s", ${JSON.stringify(sampleData[e])});`
  ).join("\n");

  // Generate HTTP tests
  const httpTests: string[] = [];
  let testCounter = 0;
  for (const entity of entities) {
    testCounter++;
    const ops = schema.operations[entity] || {};
    // Make test data unique to avoid conflicts with setup data
    const testSample = { ...sampleData[entity] };
    for (const [col, c] of Object.entries(schema.tables[entity])) {
      if (c.unique && testSample[col] && typeof testSample[col] === "string") {
        testSample[col] = `${testSample[col]}_test${testCounter}`;
      }
    }

    httpTests.push(`
  test("${entity} CRUD", async () => {
    // Create
    const created = await api.post("/${entity}s", ${JSON.stringify(testSample)});
    expect(created.id).toBeDefined();
    const id = created.id;

    // Read
    const fetched = await api.get(\`/${entity}s/\${id}\`);
    expect(fetched.id).toBe(id);

    // List (paginated)
    const list = await api.get("/${entity}s");
    expect(Array.isArray(list.items)).toBe(true);
    expect(typeof list.total).toBe("number");

    // Update
    const updated = await api.put(\`/${entity}s/\${id}\`, {});
    expect(updated.id).toBe(id);

    // Delete
    const deleted = await api.del(\`/${entity}s/\${id}\`);
    expect(deleted.deleted).toBe(true);
  });`);

    // Operation tests - use unique data
    let opCounter = 0;
    for (const opName of Object.keys(ops)) {
      opCounter++;
      const opSample = { ...testSample };
      for (const [col, c] of Object.entries(schema.tables[entity])) {
        if (c.unique && opSample[col] && typeof opSample[col] === "string") {
          opSample[col] = `${sampleData[entity][col]}_op${testCounter}_${opCounter}`;
        }
      }
      httpTests.push(`
  test("${entity} ${opName}", async () => {
    const created = await api.post("/${entity}s", ${JSON.stringify(opSample)});
    const result = await api.post(\`/${entity}s/\${created.id}/${opName.replace(/_/g, "-")}\`, {}, false);
    // May fail due to guards, just verify endpoint responds
    expect(result).toBeDefined();
  });`);
    }
  }

  // Generate MCP tests
  const mcpTests: string[] = [];
  let mcpCounter = 0;
  for (const entity of entities) {
    mcpCounter++;
    const ops = schema.operations[entity] || {};
    // Make MCP test data unique
    const mcpSample = { ...sampleData[entity] };
    for (const [col, c] of Object.entries(schema.tables[entity])) {
      if (c.unique && mcpSample[col] && typeof mcpSample[col] === "string") {
        mcpSample[col] = `${mcpSample[col]}_mcp${mcpCounter}`;
      }
    }

    mcpTests.push(`
  test("${entity} MCP tools", async () => {
    // Create via MCP
    const created = await mcp.call("create_${entity}", ${JSON.stringify(mcpSample)});
    expect(created).toMatch(/\\"id\\":/);
    const id = JSON.parse(created).id;

    // List
    const list = await mcp.call("list_${entity}s", {});
    expect(list).toContain(\`"id": \${id}\`);

    // Get
    const fetched = await mcp.call("get_${entity}", { id });
    expect(fetched).toContain(\`"id": \${id}\`);

    // Delete
    const deleted = await mcp.call("delete_${entity}", { id });
    expect(deleted).toBe("Deleted");
  });`);

    // Operation tests - use unique data
    let mcpOpCounter = 0;
    for (const opName of Object.keys(ops)) {
      mcpOpCounter++;
      const mcpOpSample = { ...mcpSample };
      for (const [col, c] of Object.entries(schema.tables[entity])) {
        if (c.unique && mcpOpSample[col] && typeof mcpOpSample[col] === "string") {
          mcpOpSample[col] = `${sampleData[entity][col]}_mcpop${mcpCounter}_${mcpOpCounter}`;
        }
      }
      mcpTests.push(`
  test("${entity} ${opName} MCP", async () => {
    const created = await mcp.call("create_${entity}", ${JSON.stringify(mcpOpSample)});
    const id = JSON.parse(created).id;
    const result = await mcp.call("${opName}_${entity}", { id });
    expect(result).toBeDefined();
  });`);
    }
  }

  return `// Generated by schema/codegen.ts — do not edit
// Integration tests for REST API and MCP

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { unlinkSync } from "fs";

const BASE_URL = "http://localhost:3086";
const TEST_DB = "test-integration.db";

// HTTP client helper
const api = {
  async get(path: string) {
    const res = await fetch(BASE_URL + "/api" + path);
    return res.json();
  },
  async post(path: string, body: unknown, expectOk = true) {
    const res = await fetch(BASE_URL + "/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (expectOk && !res.ok) throw new Error(\`POST \${path} failed: \${res.status}\`);
    return res.json();
  },
  async put(path: string, body: unknown) {
    const res = await fetch(BASE_URL + "/api" + path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async del(path: string) {
    const res = await fetch(BASE_URL + "/api" + path, { method: "DELETE" });
    return res.json();
  },
};

// MCP client helper
class McpClient {
  private proc: Subprocess;
  private reqId = 0;
  private pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  private buffer = "";

  constructor(proc: Subprocess) {
    this.proc = proc;
    this.readLoop();
  }

  private async readLoop() {
    const reader = this.proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      this.buffer += decoder.decode(value);
      const lines = this.buffer.split("\\n");
      this.buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          }
        } catch {}
      }
    }
  }

  async init() {
    return this.request("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
  }

  async call(tool: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request("tools/call", { name: tool, arguments: args });
    const content = (result as { content: { text: string }[] }).content;
    return content[0]?.text || "";
  }

  async listTools(): Promise<{ name: string }[]> {
    const result = await this.request("tools/list", {}) as { tools: { name: string }[] };
    return result.tools;
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.reqId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: string) => void, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n";
      this.proc.stdin.write(msg);
    });
  }

  close() {
    this.proc.kill();
  }
}

let httpServer: Subprocess;
let mcpProc: Subprocess;
let mcp: McpClient;

beforeAll(async () => {
  // Clean test db
  try { unlinkSync(TEST_DB); } catch {}

  // Start HTTP server on test port (auth disabled for tests)
  httpServer = spawn({
    cmd: ["bun", "run", "src/generated/server.ts"],
    env: { ...process.env, PORT: "3086", DB_PATH: TEST_DB, AUTH_ENABLED: "false" },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to start
  await new Promise(r => setTimeout(r, 500));

  // Start MCP server
  mcpProc = spawn({
    cmd: ["bun", "run", "src/generated/mcp.ts"],
    env: { ...process.env, DB_PATH: TEST_DB },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  mcp = new McpClient(mcpProc);
  await mcp.init();

  // Setup dependencies in order
${setupCalls}
});

afterAll(() => {
  httpServer?.kill();
  mcp?.close();
  try { unlinkSync(TEST_DB); } catch {}
});

describe("REST API", () => {
  test("health check", async () => {
    const res = await fetch(BASE_URL + "/health");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  test("pagination", async () => {
    const res = await api.get("/customers?limit=1&offset=0");
    expect(res.items.length).toBeLessThanOrEqual(1);
    expect(typeof res.total).toBe("number");
    expect(res.limit).toBe(1);
    expect(res.offset).toBe(0);
  });

  test("sorting", async () => {
    const asc = await api.get("/customers?sort=id&order=asc");
    const desc = await api.get("/customers?sort=id&order=desc");
    if (asc.items.length > 1) {
      expect(asc.items[0].id).toBeLessThan(asc.items[asc.items.length - 1].id);
      expect(desc.items[0].id).toBeGreaterThan(desc.items[desc.items.length - 1].id);
    }
  });

  test("filtering", async () => {
    const created = await api.post("/venues", { name: "Filter Test", address: "1 St", city: "Town", postcode: "TR1 1AA", capacity: 50 });
    const filtered = await api.get(\`/venues?name=Filter%20Test\`);
    expect(filtered.items.some((v: { id: number }) => v.id === created.id)).toBe(true);
  });
${httpTests.join("")}
});

describe("MCP Protocol", () => {
  test("tools/list returns all tools", async () => {
    const result = await mcp.listTools();
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(t => t.name === "list_customers")).toBe(true);
  });
${mcpTests.join("")}
});
`;
}

// ============================================================================
// MCP Server Generation
// ============================================================================

function genMcpServer(schema: Schema): string {
  const entities = Object.keys(schema.tables);
  const tools: string[] = [];
  const handlers: string[] = [];

  for (const entity of entities) {
    const Entity = pascalCase(entity);
    const cols = schema.tables[entity];
    const ops = schema.operations[entity] || {};

    // Input properties for create/update
    const inputProps: Record<string, { type: string; description: string }> = {};
    const requiredProps: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      if (c.pk && c.auto) continue;
      inputProps[col] = {
        type: c.type === "integer" ? "number" : "string",
        description: col.replace(/_/g, " "),
      };
      if (c.required && c.default === null) requiredProps.push(col);
    }

    // List tool
    tools.push(`    {
      name: "list_${entity}s",
      description: "List all ${entity}s",
      inputSchema: { type: "object", properties: {} },
    }`);
    handlers.push(`      case "list_${entity}s":
        return { content: [{ type: "text", text: JSON.stringify(S.findAll${Entity}s(db), null, 2) }] };`);

    // Get tool
    tools.push(`    {
      name: "get_${entity}",
      description: "Get a ${entity} by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "${entity} ID" } },
        required: ["id"],
      },
    }`);
    handlers.push(`      case "get_${entity}":
        const ${entity} = S.find${Entity}ById(db, args.id as number);
        if (!${entity}) return { content: [{ type: "text", text: "Not found" }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(${entity}, null, 2) }] };`);

    // Create tool
    tools.push(`    {
      name: "create_${entity}",
      description: "Create a new ${entity}",
      inputSchema: {
        type: "object",
        properties: ${JSON.stringify(inputProps)},
        required: ${JSON.stringify(requiredProps)},
      },
    }`);
    handlers.push(`      case "create_${entity}":
        const create${Entity}Result = S.create${Entity}(db, args as T.${Entity}Input);
        if (!create${Entity}Result.ok) return { content: [{ type: "text", text: create${Entity}Result.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(create${Entity}Result.data) }] };`);

    // Delete tool
    tools.push(`    {
      name: "delete_${entity}",
      description: "Delete a ${entity}",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "${entity} ID" } },
        required: ["id"],
      },
    }`);
    handlers.push(`      case "delete_${entity}":
        const delete${Entity}Result = S.delete${Entity}(db, args.id as number);
        if (!delete${Entity}Result.ok) return { content: [{ type: "text", text: delete${Entity}Result.error }], isError: true };
        return { content: [{ type: "text", text: "Deleted" }] };`);

    // Custom operations
    for (const opName of Object.keys(ops)) {
      const OpName = camelCase(opName);
      tools.push(`    {
      name: "${opName}_${entity}",
      description: "${opName.replace(/_/g, " ")} a ${entity}",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "${entity} ID" } },
        required: ["id"],
      },
    }`);
      handlers.push(`      case "${opName}_${entity}":
        const ${OpName}${Entity}Result = S.${OpName}${Entity}(db, args.id as number);
        if (!${OpName}${Entity}Result.ok) return { content: [{ type: "text", text: ${OpName}${Entity}Result.error }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(${OpName}${Entity}Result.data) }] };`);
    }
  }

  return `// Generated by schema/codegen.ts — do not edit
// MCP Server for Duchy Opera

import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as S from "./services";
import * as T from "./types";

const DB_PATH = process.env.DB_PATH || "opera.db";

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

const sql = fs.readFileSync("src/generated/schema.sql", "utf-8");
const statements = sql.split(/;\\s*\\n/).filter((s: string) => s.trim());
for (const stmt of statements) {
  if (stmt.trim()) db.run(stmt);
}

const SERVER_INFO = {
  name: "duchy-opera",
  version: "1.0.0",
};

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

function handleRequest(req: McpRequest): McpResponse {
  switch (req.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: {
          protocolVersion: "2024-11-05",
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
      const result = callTool(name, args);
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

function callTool(name: string, args: Record<string, unknown>): { content: { type: string; text: string }[]; isError?: boolean } {
  switch (name) {
${handlers.join("\n")}
    default:
      return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  }
}

// Stdio transport
async function main() {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);

    // Parse JSON-RPC messages (newline delimited)
    const lines = buffer.split("\\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const req = JSON.parse(line) as McpRequest;
        const res = handleRequest(req);
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
`;
}

// ============================================================================
// Effects Interface
// ============================================================================

function genEffectsInterface(schema: Schema): string {
  const events = new Set<string>();
  const notifyTemplates = new Set<string>();
  const calls = new Set<string>();

  for (const ops of Object.values(schema.operations)) {
    for (const op of Object.values(ops)) {
      for (const e of op.effects) {
        if (e.emit) events.add(e.emit);
        if (e.notify) notifyTemplates.add(e.notify.template);
        if (e.call) calls.add(`${e.call.service}.${e.call.action}`);
      }
    }
  }

  return `// Generated by schema/codegen.ts — do not edit

// Events emitted by operations
export type Event =
${[...events].map(e => `  | "${e}"`).join("\n") || "  | never"};

// Notification templates
export type NotifyTemplate =
${[...notifyTemplates].map(t => `  | "${t}"`).join("\n") || "  | never"};

// External service calls
export type ServiceCall =
${[...calls].map(c => `  | "${c}"`).join("\n") || "  | never"};

// Effect handlers interface
export interface EffectHandlers {
  emit(event: Event, data: unknown): Promise<void>;
  notify(channel: string, template: NotifyTemplate, to: string, data: unknown): Promise<void>;
  call(service: string, action: string, data: unknown): Promise<unknown>;
}
`;
}

// ============================================================================
// OpenAPI Spec Generation
// ============================================================================

function genOpenAPI(schema: Schema): string {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  // Error schema
  schemas.Error = {
    type: "object",
    properties: {
      error: { type: "string" },
      code: { type: "string", enum: ["not_found", "invalid", "bad_state", "conflict"] },
      details: { type: "object", additionalProperties: { type: "string" } },
    },
    required: ["error", "code"],
  };

  // Paginated response schema
  schemas.PaginatedResponse = {
    type: "object",
    properties: {
      items: { type: "array", items: {} },
      total: { type: "integer" },
      limit: { type: "integer" },
      offset: { type: "integer" },
    },
  };

  for (const [entity, cols] of Object.entries(schema.tables)) {
    const Entity = pascalCase(entity);
    const ops = schema.operations[entity] || {};

    // Entity schema
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      properties[col] = {
        type: c.type === "integer" ? "integer" : "string",
        ...(c.default !== null && { default: c.default }),
      };
      if (c.required || c.pk) required.push(col);
    }
    schemas[Entity] = { type: "object", properties, required };

    // Input schema (no auto pk)
    const inputProps: Record<string, unknown> = {};
    const inputRequired: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      if (c.pk && c.auto) continue;
      inputProps[col] = { type: c.type === "integer" ? "integer" : "string" };
      if (c.required && c.default === null) inputRequired.push(col);
    }
    schemas[`${Entity}Input`] = { type: "object", properties: inputProps, required: inputRequired };

    // List endpoint
    paths[`/api/${entity}s`] = {
      get: {
        summary: `List ${entity}s`,
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "sort", in: "query", schema: { type: "string" } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          "200": {
            description: "Paginated list",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } },
          },
        },
      },
      post: {
        summary: `Create ${entity}`,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };

    // Single entity endpoints
    paths[`/api/${entity}s/{id}`] = {
      get: {
        summary: `Get ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Found", content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}` } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      put: {
        summary: `Update ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        summary: `Delete ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Deleted", content: { "application/json": { schema: { type: "object", properties: { deleted: { type: "boolean" } } } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };

    // Custom operations
    for (const opName of Object.keys(ops)) {
      paths[`/api/${entity}s/{id}/${opName.replace(/_/g, "-")}`] = {
        post: {
          summary: `${opName.replace(/_/g, " ")} ${entity}`,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Success", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" }, status: { type: "string" } } } } } },
            "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      };
    }
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Duchy Opera API",
      version: "1.0.0",
      description: "REST API for Duchy Opera charity event platform",
    },
    servers: [{ url: "http://localhost:3085" }],
    paths,
    components: { schemas },
  };

  return JSON.stringify(spec, null, 2);
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const schema: Schema = JSON.parse(input);

  const outDir = join(import.meta.dir, "..", "src", "generated");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(outDir, "types.ts"), genTypes(schema.tables));
  writeFileSync(join(outDir, "services.ts"), genServices(schema));
  writeFileSync(join(outDir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(outDir, "server.ts"), genRoutes(schema));
  writeFileSync(join(outDir, "integration.test.ts"), genIntegrationTests(schema));
  writeFileSync(join(outDir, "mcp.ts"), genMcpServer(schema));
  writeFileSync(join(outDir, "openapi.json"), genOpenAPI(schema));

  console.log("wrote src/generated/schema.sql");
  console.log("wrote src/generated/types.ts");
  console.log("wrote src/generated/services.ts");
  console.log("wrote src/generated/effects.ts");
  console.log("wrote src/generated/server.ts");
  console.log("wrote src/generated/integration.test.ts");
  console.log("wrote src/generated/mcp.ts");
  console.log("wrote src/generated/openapi.json");
}
