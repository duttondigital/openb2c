import type { Column, Schema } from "./types";
import { requiredProductionEnvVars } from "./config";
import { hasCommerceWorkflow, hasCommerceBookingAliases, pascalCase, camelCase } from "./utils";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);

function redactedFieldsForSchema(schema: Schema): Record<string, string[]> {
  const redacted: Record<string, Set<string>> = {
    api_key: new Set(["key_hash"]),
  };

  for (const [entity, columns] of Object.entries(schema.tables)) {
    for (const [field, column] of Object.entries(columns)) {
      const metadata = column.metadata || {};
      if (metadata.redact || metadata.privacy === "secret") {
        if (!redacted[entity]) redacted[entity] = new Set();
        redacted[entity].add(field);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(redacted)
      .map(([entity, fields]) => [entity, [...fields].sort()])
      .filter(([, fields]) => (fields as string[]).length > 0),
  ) as Record<string, string[]>;
}

function genConfiguredCommerceRoutes(schema: Schema): string[] {
  const compatibilityRoutes = hasCommerceBookingAliases(schema) ? `
  // Compatibility aliases for the original booking-oriented API.
  { method: "POST", path: "/commerce/bookings/reserve", handler: async (req, _, auth, signal) => {
    const input = await readJson<S.ReserveBookingInput>(req, signal);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const r = S.reserveBooking(db, input.data, auth);
    if (r.ok) {
      await FX.dispatchEffects(db, r.effects || [], {
        source: "rest",
        operation: "commerce.reserve_booking",
        entity: "booking",
        recordId: r.data.booking_id,
        result: r.data,
        idempotencyKey: req.headers.get("Idempotency-Key") || undefined,
      });
    }
    return r.ok ? corsResponse(r.data, { status: 201 }) : corsResponse(r, { status: S.statusForResult(r) });
  }},
  { method: "POST", path: "/commerce/bookings/:id/payment-intent", handler: async (req, p, auth) => {
    const r = S.createPaymentIntentForBooking(db, +p.id, auth);
    if (r.ok) {
      await FX.dispatchEffects(db, r.effects || [], {
        source: "rest",
        operation: "commerce.create_payment_intent",
        entity: "booking",
        recordId: r.data.booking_id,
        result: r.data,
        idempotencyKey: req.headers.get("Idempotency-Key") || ("booking-payment-intent:" + r.data.booking_id),
      });
    }
    return r.ok ? corsResponse(r.data, { status: 201 }) : corsResponse(r, { status: S.statusForResult(r) });
  }},
  { method: "POST", path: "/commerce/bookings/expire", handler: (_, __, auth) => {
    if (!S.hasScope(auth, "booking.expire") && !S.hasScope(auth, "commerce.expire") && !S.hasScope(auth, "*")) {
      return corsResponse({ error: "forbidden", code: "forbidden" }, { status: 403 });
    }
    const r = S.expireCheckoutBookings(db);
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},` : "";
  return [
`  // Generic ecommerce
  { method: "GET", path: "/commerce/catalog", handler: () => {
    const r = S.listCommerceCatalog(db);
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},
  { method: "POST", path: "/commerce/checkout", handler: async (req, _, auth, signal) => {
    const input = await readCommerceCheckoutInput(req, signal);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const r = S.checkoutCommerceCart(db, input.data, auth);
    if (r.ok) {
      await FX.dispatchEffects(db, r.effects || [], {
        source: "rest",
        operation: "commerce.checkout",
        entity: "commerce_order",
        recordId: r.data.order_id,
        result: r.data,
        idempotencyKey: req.headers.get("Idempotency-Key") || undefined,
      });
    }
    return r.ok ? corsResponse(r.data, { status: 201 }) : corsResponse(r, { status: S.statusForResult(r) });
  }},
  { method: "POST", path: "/commerce/orders/:id/payment-intent", handler: async (req, p, auth) => {
    const r = S.createCommercePaymentIntent(db, +p.id, auth);
    if (r.ok) {
      await FX.dispatchEffects(db, r.effects || [], {
        source: "rest",
        operation: "commerce.create_payment_intent",
        entity: "commerce_order",
        recordId: r.data.order_id,
        result: r.data,
        idempotencyKey: req.headers.get("Idempotency-Key") || ("commerce-payment-intent:" + r.data.order_id),
      });
    }
    return r.ok ? corsResponse(r.data, { status: 201 }) : corsResponse(r, { status: S.statusForResult(r) });
  }},
  { method: "POST", path: "/commerce/payments/webhook", handler: async (req, _, __, signal) => {
    const contentType = req.headers.get("content-type") || "";
    const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
      return corsResponse({ ok: false, error: "content-type must be application/json", code: "unsupported_media_type" }, { status: 415 });
    }
    const raw = await readRequestBody(req, signal);
    if (!raw.ok) return corsResponse(raw, { status: S.statusForResult(raw) });
    if (!(await verifyPaymentWebhookSignature(req, raw.data))) {
      return corsResponse({ error: "invalid payment webhook signature", code: "invalid" }, { status: 401 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.data);
    } catch {
      return corsResponse({ ok: false, error: "malformed JSON", code: "malformed" }, { status: 400 });
    }
    const input = parsePaymentWebhookInput(payload);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const r = S.handleCommercePaymentWebhook(db, input.data);
    if (r.ok) {
      await FX.dispatchEffects(db, r.effects || [], {
        source: "rest",
        operation: "commerce.payment_webhook",
        entity: "commerce_order",
        recordId: r.data.order_id,
        result: r.data,
        idempotencyKey: "payment-webhook:" + input.data.reference + ":" + input.data.status,
      });
    }
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},
  { method: "POST", path: "/commerce/orders/expire", handler: (_, __, auth) => {
    if (!S.hasScope(auth, "commerce.expire") && !S.hasScope(auth, "*")) {
      return corsResponse({ error: "forbidden", code: "forbidden" }, { status: 403 });
    }
    const r = S.expireCommerceOrders(db);
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},${compatibilityRoutes}`,
  ];
}

type RequestFieldSpec = {
  type: string;
  required: boolean;
  label: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: string[];
};

type RequestSchema = {
  fields: Record<string, RequestFieldSpec>;
};

function requestFieldSpec(field: string, column: Column, required: boolean): RequestFieldSpec {
  const metadata = column.metadata || {};
  const validation = column.validation || {};
  return {
    type: column.type,
    required,
    label: metadata.label || field,
    ...(metadata.format ? { format: metadata.format } : {}),
    ...(validation.minLength !== undefined && validation.minLength !== null ? { minLength: validation.minLength } : {}),
    ...(validation.maxLength !== undefined && validation.maxLength !== null ? { maxLength: validation.maxLength } : {}),
    ...(validation.minimum !== undefined && validation.minimum !== null ? { minimum: validation.minimum } : {}),
    ...(validation.maximum !== undefined && validation.maximum !== null ? { maximum: validation.maximum } : {}),
    ...(validation.pattern ? { pattern: validation.pattern } : {}),
    ...(validation.enum?.length ? { enum: validation.enum } : {}),
  };
}

function createRelationshipFields(schema: Schema, entity: string): Set<string> {
  const fields = new Set<string>();
  for (const relationship of schema.operations[entity]?.create?.relationships || []) {
    if (relationship.field.table === entity) fields.add(relationship.field.field);
  }
  return fields;
}

function requestSchemasForSchema(schema: Schema): Record<string, { create: RequestSchema; update: RequestSchema }> {
  const result: Record<string, { create: RequestSchema; update: RequestSchema }> = {};
  for (const [entity, columns] of Object.entries(schema.tables)) {
    const createOptional = createRelationshipFields(schema, entity);
    const createFields: Record<string, RequestFieldSpec> = {};
    const updateFields: Record<string, RequestFieldSpec> = {};

    for (const [field, column] of Object.entries(columns)) {
      if (column.pk && column.auto) continue;
      const generatedApiKeyField = entity === "api_key" && (field === "key_hash" || field === "key_prefix");
      if (!generatedApiKeyField) {
        createFields[field] = requestFieldSpec(field, column, column.required && !createOptional.has(field));
      }
      updateFields[field] = requestFieldSpec(field, column, false);
    }

    result[entity] = {
      create: { fields: createFields },
      update: { fields: updateFields },
    };
  }
  return result;
}

export function genRoutes(schema: Schema): string {
  const requiredProductionEnv = requiredProductionEnvVars(schema);
  const redactedFields = redactedFieldsForSchema(schema);
  const requestSchemas = requestSchemasForSchema(schema);
  const supportsApiKeys = Boolean(schema.tables.api_key);
  const entities = Object.keys(schema.tables);
  const routes: string[] = [];

  if (hasCommerceWorkflow(schema)) {
    routes.push(...genConfiguredCommerceRoutes(schema));
    routes.push("");
  }

  for (const entity of entities) {
    const Entity = pascalCase(entity);
    const ops = schema.operations[entity] || {};

    routes.push(`  // ${Entity}`);
    routes.push(`  { method: "GET", path: "/api/${entity}s", handler: (req, _, auth) => {
    const authz = S.authorizeCollection("${entity}", "read", auth);
    if (!authz.ok) return corsResponse(authz, { status: S.statusForResult(authz) });
    const url = new URL(req.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const offset = clampOffset(url.searchParams.get("offset"));
    const sort = url.searchParams.get("sort") || undefined;
    const order = url.searchParams.get("order") as "asc" | "desc" | undefined;
    const filter: Record<string, string> = {};
    for (const [k, v] of url.searchParams) {
      if (!["limit", "offset", "sort", "order"].includes(k)) filter[k] = v;
    }
    const items = S.findAll${Entity}s(db, { limit, offset, sort, order, filter: Object.keys(filter).length ? filter : undefined }, auth);
    const total = S.count${Entity}s(db, Object.keys(filter).length ? filter : undefined, auth);
    return corsResponse({ items: items.map(i => redact("${entity}", i)), total, limit, offset });
  }},`);
    routes.push(`  { method: "GET", path: "/api/${entity}s/:id", handler: (_, p, auth) => {
    const authz = S.authorizeCollection("${entity}", "read", auth);
    if (!authz.ok) return corsResponse(authz, { status: S.statusForResult(authz) });
    const r = S.find${Entity}ById(db, +p.id, auth);
    return r ? corsResponse(redact("${entity}", r), recordResponseInit("${entity}", r as Record<string, unknown>)) : corsResponse({ error: "not found", code: "not_found" }, { status: 404 });
  }},`);

    // Special handling for api_key creation - generate and hash key
    if (entity === "api_key") {
      routes.push(`  { method: "POST", path: "/api/${entity}s", handler: async (req, _, auth, signal) => {
    const input = await readTypedJson<{ name: string; user_id?: number; scopes?: string; expires_at?: string }>(req, signal, REQUEST_SCHEMAS["${entity}"].create);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const rawKey = S.generateApiKey();
    const keyHash = await S.hashApiKey(rawKey);
    const r = S.createApiKey(db, { ...input.data, key_hash: keyHash, key_prefix: rawKey.slice(0, 11) }, auth, { source: "rest" });
    if (!r.ok) return corsResponse(r, { status: S.statusForResult(r) });
    // Return raw key ONCE - it cannot be retrieved again
    return corsResponse({ id: r.data.id, key: rawKey, key_prefix: rawKey.slice(0, 11) }, { status: 201 });
  }},`);
    } else {
      routes.push(`  { method: "POST", path: "/api/${entity}s", handler: async (req, _, auth, signal) => {
    const input = await readTypedJson<T.${Entity}Input>(req, signal, REQUEST_SCHEMAS["${entity}"].create);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const r = S.create${Entity}(db, input.data, auth, { source: "rest" });
    return r.ok ? corsResponse(r.data, { status: 201 }) : corsResponse(r, { status: S.statusForResult(r) });
  }},`);
    }

    routes.push(`  { method: "PUT", path: "/api/${entity}s/:id", handler: async (req, p, auth, signal) => {
    const input = await readTypedJson<Partial<T.${Entity}Input>>(req, signal, REQUEST_SCHEMAS["${entity}"].update, { partial: true });
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const r = S.update${Entity}(db, +p.id, input.data, auth, req.headers.get("If-Match"), { source: "rest" });
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},`);
    routes.push(`  { method: "DELETE", path: "/api/${entity}s/:id", handler: (req, p, auth) => {
    const r = S.delete${Entity}(db, +p.id, auth, req.headers.get("If-Match"), { source: "rest" });
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},`);

    // Custom operations
    for (const opName of Object.keys(ops).filter(op => !CRUD_ACTIONS.has(op))) {
      const OpName = camelCase(opName);
      routes.push(`  { method: "POST", path: "/api/${entity}s/:id/${opName.replace(/_/g, "-")}", handler: async (req, p, auth) => {
    const r = S.${OpName}${Entity}(db, +p.id, auth, req.headers.get("If-Match"), { source: "rest" });
    if (r.ok) {
      await FX.dispatchEffects(db, r.effects || [], {
        source: "rest",
        operation: "${entity}.${opName}",
        entity: "${entity}",
        recordId: +p.id,
        result: r.data,
        idempotencyKey: req.headers.get("Idempotency-Key") || undefined,
      });
    }
    return r.ok ? corsResponse(r.data) : corsResponse(r, { status: S.statusForResult(r) });
  }},`);
    }
    routes.push("");
  }

  return `// Generated by schema/codegen.ts — do not edit

import * as FX from "./effects";
import { APP_CONFIG, DB_PATH, PRODUCTION, REGISTRY_PRIVATE_KEY, REGISTRY_PUBLIC_KEY, REQUIRE_LOCAL_CERTIFICATE_REGISTRY, bootstrapRuntime, initRegistryPublicKey, log } from "./runtime";
import * as S from "./services";
import * as T from "./types";

const PORT = parseInt(process.env.PORT || String(APP_CONFIG.defaultPorts.server), 10);
const MAX_REQUEST_BODY_BYTES = parseInt(process.env.MAX_REQUEST_BODY_BYTES || "1048576", 10);
const MAX_PAGE_LIMIT = parseInt(process.env.MAX_PAGE_LIMIT || "1000", 10);
const ROUTE_TIMEOUT_MS = Math.max(parseInt(process.env.ROUTE_TIMEOUT_MS || "30000", 10) || 30000, 1);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map(o => o.trim()).filter(Boolean);
const CORS_ALLOW_CREDENTIALS = process.env.CORS_ALLOW_CREDENTIALS === "true";
const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";  // enabled by default
const SUPPORTS_API_KEYS = ${JSON.stringify(supportsApiKeys)};
const API_VERSION = APP_CONFIG.version;
const API_VERSION_HEADER = "X-OpenB2C-API-Version";
const PRODUCTION = process.env.NODE_ENV === "production";
const ALLOW_INSECURE_AUTH_DISABLED = process.env.ALLOW_INSECURE_AUTH_DISABLED === "true";
const ALLOW_WILDCARD_CORS = process.env.ALLOW_WILDCARD_CORS === "true";
const ALLOW_EPHEMERAL_REGISTRY_KEYS = process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS === "true";
const REQUIRED_PRODUCTION_ENV = ${JSON.stringify(requiredProductionEnv, null, 2)} as const;

// Fields to exclude from API responses (sensitive data)
const REDACTED_FIELDS: Record<string, string[]> = ${JSON.stringify(redactedFields, null, 2)};

type RequestFieldSpec = {
  type: string;
  required: boolean;
  label: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: string[];
};

type RequestSchema = {
  fields: Record<string, RequestFieldSpec>;
};

const REQUEST_SCHEMAS: Record<string, { create: RequestSchema; update: RequestSchema }> = ${JSON.stringify(requestSchemas, null, 2)};

function redact<T extends Record<string, unknown>>(entity: string, obj: T): T {
  const fields = REDACTED_FIELDS[entity];
  if (!fields) return obj;
  const result = { ...obj };
  for (const f of fields) delete (result as Record<string, unknown>)[f];
  return result;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

class RouteTimeoutError extends Error {
  constructor() {
    super("request timed out");
  }
}

function timeoutResult(): S.Result<never> {
  return { ok: false, error: "request timed out", code: "timeout" };
}

async function readRequestBody(req: Request, signal: AbortSignal): Promise<S.Result<string>> {
  if (!req.body) return { ok: true, data: "" };
  if (signal.aborted) return timeoutResult();

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () => reject(new RouteTimeoutError());
    signal.addEventListener("abort", abortListener, { once: true });
  });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, error: "request body too large", code: "payload_too_large" };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { ok: true, data: body };
  } catch (err) {
    if (err instanceof RouteTimeoutError) {
      await reader.cancel().catch(() => {});
      return timeoutResult();
    }
    throw err;
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

async function readJson<T>(req: Request, signal: AbortSignal): Promise<S.Result<T>> {
  const contentType = req.headers.get("content-type") || "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    return { ok: false, error: "content-type must be application/json", code: "unsupported_media_type" };
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, error: "request body too large", code: "payload_too_large" };
  }

  const body = await readRequestBody(req, signal);
  if (!body.ok) return body;

  try {
    return { ok: true, data: JSON.parse(body.data) as T };
  } catch {
    return { ok: false, error: "malformed JSON", code: "malformed" };
  }
}

function requestValidationError<T>(details: Record<string, string>): S.Result<T> {
  return { ok: false, error: "request validation failed", code: "invalid", details };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRequestField(field: string, value: unknown, spec: RequestFieldSpec, details: Record<string, string>) {
  const label = spec.label || field;
  if (value === null) {
    details[field] = \`\${label} cannot be null\`;
    return;
  }

  const type = spec.type.toLowerCase();
  if (type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      details[field] = \`\${label} must be an integer\`;
      return;
    }
  } else if (type === "real") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      details[field] = \`\${label} must be a finite number\`;
      return;
    }
  } else if (type === "text") {
    if (typeof value !== "string") {
      details[field] = \`\${label} must be a string\`;
      return;
    }
  } else if (type === "blob" && typeof value !== "string") {
    details[field] = \`\${label} must be a string\`;
    return;
  }

  const text = typeof value === "string" ? value : String(value);
  const numeric = typeof value === "number" ? value : Number(value);
  if (spec.enum?.length && !spec.enum.includes(text)) details[field] = \`\${label} must be one of: \${spec.enum.join(", ")}\`;
  if (spec.minLength !== undefined && text.length < spec.minLength) details[field] = \`\${label} must be at least \${spec.minLength} characters\`;
  if (spec.maxLength !== undefined && text.length > spec.maxLength) details[field] = \`\${label} must be at most \${spec.maxLength} characters\`;
  if (spec.pattern && !new RegExp(spec.pattern).test(text)) details[field] = \`\${label} has an invalid format\`;
  if (spec.minimum !== undefined && (!Number.isFinite(numeric) || numeric < spec.minimum)) details[field] = \`\${label} must be at least \${spec.minimum}\`;
  if (spec.maximum !== undefined && (!Number.isFinite(numeric) || numeric > spec.maximum)) details[field] = \`\${label} must be at most \${spec.maximum}\`;

  switch (spec.format) {
    case "email":
      if (!S.validateEmail(text)) details[field] = \`\${label} must be a valid email address\`;
      break;
    case "postcode":
      if (!S.validatePostcode(text)) details[field] = \`\${label} must be a valid UK postcode\`;
      break;
    case "phone":
      if (!S.validatePhone(text)) details[field] = \`\${label} must be a valid UK phone number\`;
      break;
    case "date":
      if (!S.validateDate(text)) details[field] = \`\${label} must use YYYY-MM-DD\`;
      break;
    case "time":
      if (!S.validateTime(text)) details[field] = \`\${label} must use HH:MM\`;
      break;
    case "url":
      try {
        new URL(text);
      } catch {
        details[field] = \`\${label} must be a valid URL\`;
      }
      break;
  }
}

function parseTypedObject<T>(value: unknown, schema: RequestSchema, options: { partial?: boolean } = {}): S.Result<T> {
  if (!isPlainObject(value)) {
    return requestValidationError<T>({ body: "body must be a JSON object" });
  }

  const details: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    const spec = schema.fields[key];
    if (!spec) {
      details[key] = "field is not allowed";
      continue;
    }
    validateRequestField(key, value[key], spec, details);
  }

  if (!options.partial) {
    for (const [field, spec] of Object.entries(schema.fields)) {
      if (spec.required && value[field] === undefined) {
        details[field] = \`\${spec.label || field} is required\`;
      }
    }
  }

  return Object.keys(details).length ? requestValidationError<T>(details) : { ok: true, data: value as T };
}

async function readTypedJson<T>(req: Request, signal: AbortSignal, schema: RequestSchema, options: { partial?: boolean } = {}): Promise<S.Result<T>> {
  const input = await readJson<unknown>(req, signal);
  if (!input.ok) return input;
  return parseTypedObject<T>(input.data, schema, options);
}

function parseCommerceOptionValue(value: unknown): S.Result<S.CommerceOptionValue> {
  if (value === null || typeof value === "string" || typeof value === "number") return { ok: true, data: value };
  return { ok: false, error: "option values must be strings, numbers, or null", code: "invalid" };
}

function parseCommerceCheckoutPayload(value: unknown): S.Result<S.CommerceCheckoutInput> {
  if (!isPlainObject(value)) return requestValidationError<S.CommerceCheckoutInput>({ body: "body must be a JSON object" });
  const details: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    if (!["user_id", "client", "items"].includes(key)) details[key] = "field is not allowed";
  }
  if (value.user_id !== undefined && (typeof value.user_id !== "number" || !Number.isInteger(value.user_id))) {
    details.user_id = "user_id must be an integer";
  }
  if (value.client !== undefined && typeof value.client !== "string") {
    details.client = "client must be a string";
  }
  if (!Array.isArray(value.items)) {
    details.items = "items must be an array";
  } else {
    value.items.forEach((item, index) => {
      const prefix = \`items.\${index}\`;
      if (!isPlainObject(item)) {
        details[prefix] = "item must be an object";
        return;
      }
      for (const key of Object.keys(item)) {
        if (!["item_id", "quantity", "options"].includes(key)) details[\`\${prefix}.\${key}\`] = "field is not allowed";
      }
      if (typeof item.item_id !== "number" || !Number.isInteger(item.item_id)) details[\`\${prefix}.item_id\`] = "item_id must be an integer";
      if (item.quantity !== undefined && (typeof item.quantity !== "number" || !Number.isInteger(item.quantity))) details[\`\${prefix}.quantity\`] = "quantity must be an integer";
      if (item.options !== undefined) {
        if (!isPlainObject(item.options)) {
          details[\`\${prefix}.options\`] = "options must be an object";
        } else {
          for (const [name, optionValue] of Object.entries(item.options)) {
            const parsed = parseCommerceOptionValue(optionValue);
            if (!parsed.ok) details[\`\${prefix}.options.\${name}\`] = parsed.error;
          }
        }
      }
    });
  }
  return Object.keys(details).length ? requestValidationError<S.CommerceCheckoutInput>(details) : { ok: true, data: value as S.CommerceCheckoutInput };
}

async function readCommerceCheckoutInput(req: Request, signal: AbortSignal): Promise<S.Result<S.CommerceCheckoutInput>> {
  const input = await readJson<unknown>(req, signal);
  if (!input.ok) return input;
  return parseCommerceCheckoutPayload(input.data);
}

function parsePaymentWebhookInput(value: unknown): S.Result<S.PaymentWebhookInput> {
  if (!isPlainObject(value)) return requestValidationError<S.PaymentWebhookInput>({ body: "body must be a JSON object" });
  const details: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    if (!["reference", "status", "provider"].includes(key)) details[key] = "field is not allowed";
  }
  if (typeof value.reference !== "string" || value.reference.length === 0) details.reference = "reference is required";
  if (value.status !== "succeeded" && value.status !== "failed") details.status = "status must be succeeded or failed";
  if (value.provider !== undefined && typeof value.provider !== "string") details.provider = "provider must be a string";
  return Object.keys(details).length ? requestValidationError<S.PaymentWebhookInput>(details) : { ok: true, data: value as S.PaymentWebhookInput };
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

async function verifyPaymentWebhookSignature(req: Request, body: string): Promise<boolean> {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return !PRODUCTION;
  const header = req.headers.get("X-OpenB2C-Signature") || "";
  const signature = header.trim().replace(/^sha256=/, "");
  if (!signature) return false;
  return safeEqual(signature, await hmacSha256Hex(secret, body));
}

function parseIntegerParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampLimit(value: string | null): number {
  return Math.min(Math.max(parseIntegerParam(value, 100), 1), MAX_PAGE_LIMIT);
}

function clampOffset(value: string | null): number {
  return Math.max(parseIntegerParam(value, 0), 0);
}

function validateProductionConfig() {
  if (!PRODUCTION) return;
  const errors: string[] = [];
  if (!AUTH_ENABLED && !ALLOW_INSECURE_AUTH_DISABLED) {
    errors.push("AUTH_ENABLED=false requires ALLOW_INSECURE_AUTH_DISABLED=true in production");
  }
  if (CORS_ORIGINS.includes("*") && !ALLOW_WILDCARD_CORS) {
    errors.push("CORS_ORIGINS must be explicit in production or ALLOW_WILDCARD_CORS=true must be set");
  }
  if (!REGISTRY_PRIVATE_KEY && !REGISTRY_PUBLIC_KEY && !ALLOW_EPHEMERAL_REGISTRY_KEYS) {
    errors.push("REGISTRY_PRIVATE_KEY or REGISTRY_PUBLIC_KEY is required in production unless ALLOW_EPHEMERAL_REGISTRY_KEYS=true");
  }
  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (!process.env[name]) errors.push(\`\${name} is required in production\`);
  }
  if (errors.length) {
    log("error", "refusing insecure production config", { errors });
    throw new Error(\`refusing insecure production config: \${errors.join("; ")}\`);
  }
}

validateProductionConfig();

const { db } = bootstrapRuntime();
const registryPubKey = await initRegistryPublicKey();

type Handler = (req: Request, params: Record<string, string>, auth: T.AuthContext, signal: AbortSignal) => Response | Promise<Response>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

const routes: Route[] = [
  // Effect operator endpoints
  { method: "GET", path: "/ops/effects", handler: (_, __, auth) => {
    if (!S.hasScope(auth, "effect.admin")) return corsResponse({ error: "forbidden", code: "forbidden" }, { status: 403 });
    return corsResponse({ items: FX.listEffectAttempts(db) });
  }},
  { method: "POST", path: "/ops/effects/retry", handler: async (_, __, auth) => {
    if (!S.hasScope(auth, "effect.admin")) return corsResponse({ error: "forbidden", code: "forbidden" }, { status: 403 });
    return corsResponse(await FX.retryFailedEffects(db));
  }},

  // Authenticated session context
  { method: "GET", path: "/auth/context", handler: (_, __, auth) => {
    if (auth.userId === null && !S.hasScope(auth, "*")) {
      return corsResponse({ error: "authenticated user required", code: "unauthorized" }, { status: 401 });
    }
    return corsResponse(auth);
  }},
  { method: "POST", path: "/auth/revoke-current", handler: async (req, __, auth) => {
    if (auth.userId === null && !S.hasScope(auth, "*")) {
      return corsResponse({ error: "authenticated user required", code: "unauthorized" }, { status: 401 });
    }
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const result = await S.revokeIdentitySessionToken(db, authHeader.slice(7));
      return result.ok ? corsResponse(result.data) : corsResponse(result, { status: S.statusForResult(result) });
    }
    const certHeader = req.headers.get("X-Certificate");
    if (!certHeader) {
      return corsResponse({ error: "certificate required", code: "unauthorized" }, { status: 401 });
    }
    try {
      const cert = JSON.parse(certHeader) as T.Certificate;
      const result = S.revokeCertificate(db, cert);
      return result.ok ? corsResponse(result.data) : corsResponse(result, { status: S.statusForResult(result) });
    } catch {
      return corsResponse({ error: "invalid certificate format", code: "malformed" }, { status: 400 });
    }
  }},

  // Identity endpoints (no auth required)
  { method: "GET", path: "/identity/public-key", handler: async () => {
    return corsResponse({ publicKey: registryPubKey });
  }},
  { method: "POST", path: "/identity/challenge", handler: async (req, _, __, signal) => {
    const input = await readJson<{ email: string; publicKey: string }>(req, signal);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const { email, publicKey } = input.data;
    if (!email || !publicKey) {
      return corsResponse({ error: "email and publicKey required", code: "invalid" }, { status: 422 });
    }
    const result = await S.createChallenge(db, email, publicKey, clientIp(req));
    if (!result.ok) {
      return corsResponse(result, { status: S.statusForResult(result) });
    }
    log("info", "identity challenge created", { email });
    // In production, code must be sent via email. In dev, return it for testing.
    if (PRODUCTION) {
      return corsResponse({ challengeId: result.data.challengeId, message: "verification code sent to email" });
    }
    return corsResponse({ challengeId: result.data.challengeId, code: result.data.code });
  }},
  { method: "POST", path: "/identity/verify", handler: async (req, _, __, signal) => {
    const input = await readJson<{ challengeId: number; code: string; signature: string }>(req, signal);
    if (!input.ok) return corsResponse(input, { status: S.statusForResult(input) });
    const { challengeId, code, signature } = input.data;
    const result = await S.verifyChallenge(db, challengeId, code, signature);
    if (!result.ok) {
      return corsResponse(result, { status: S.statusForResult(result) });
    }
    const userId = S.ensureUser(db, result.data.email);
    const session = await S.issueIdentitySession(db, userId);
    if (!session.ok) {
      return corsResponse(session, { status: S.statusForResult(session) });
    }
    return corsResponse({
      certificate: result.data,
      sessionToken: session.data.token,
      sessionExpiresAt: session.data.expiresAt,
      auth: { userId, scopes: [...S.SELF_SERVICE_SCOPES] },
    });
  }},

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

const CORS_ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type, Authorization, X-Certificate, X-Signature, X-Timestamp, X-OpenB2C-Signature, Idempotency-Key, If-Match, X-OpenB2C-API-Version";

function corsResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set(API_VERSION_HEADER, API_VERSION);
  return Response.json(body, { ...init, headers });
}

function recordResponseInit(entity: string, record: Record<string, unknown>): ResponseInit {
  const headers = new Headers();
  const etag = S.entityTagForRecord(entity, record);
  if (etag) headers.set("ETag", etag);
  return { headers };
}

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
  headers.set("Access-Control-Expose-Headers", "ETag, " + API_VERSION_HEADER);
  headers.set("Vary", "Origin");
  return headers;
}

function applyCors(req: Request, res: Response): Response {
  for (const [k, v] of corsHeaders(req)) {
    res.headers.set(k, v);
  }
  return res;
}

function response(req: Request, body: unknown, init?: ResponseInit): Response {
  return applyCors(req, corsResponse(body, init));
}

function preflightResponse(req: Request): Response {
  if (req.headers.has("origin") && !allowedCorsOrigin(req)) {
    return response(req, { error: "origin not allowed", code: "forbidden" }, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

async function runRouteWithTimeout(handler: (signal: AbortSignal) => Response | Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const route = Promise.resolve().then(() => handler(controller.signal));
  const timedOut = new Promise<Response>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(corsResponse(timeoutResult(), { status: 504 }));
    }, ROUTE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([route, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function hasApiVersionSurface(path: string): boolean {
  return path.startsWith("/api/")
    || path.startsWith("/commerce/")
    || path.startsWith("/auth/")
    || path.startsWith("/identity/")
    || path.startsWith("/ops/");
}

function apiVersionError(requested: string): S.Result<never> {
  return {
    ok: false,
    error: "unsupported API version",
    code: "unsupported_version",
    details: {
      requested,
      supported: API_VERSION,
    },
  };
}

export const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const start = performance.now();
    const url = new URL(req.url);
    let authContext: T.AuthContext = AUTH_ENABLED ? T.ANONYMOUS_AUTH_CONTEXT : T.SYSTEM_AUTH_CONTEXT;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return preflightResponse(req);
    }

    // Health check (no auth)
    if (url.pathname === "/health") {
      return response(req, { status: "ok", app: APP_CONFIG.slug, version: API_VERSION, db: DB_PATH, auth: AUTH_ENABLED });
    }

    const requestedApiVersion = req.headers.get(API_VERSION_HEADER);
    if (requestedApiVersion && requestedApiVersion !== API_VERSION && hasApiVersionSurface(url.pathname)) {
      return response(req, apiVersionError(requestedApiVersion), { status: 400 });
    }

    // Skip auth for identity endpoints
    if (url.pathname.startsWith("/identity/")) {
      // handled by routes
    }
    // Auth check for protected endpoints. Missing credentials remain anonymous so
    // per-route authorization can distinguish public endpoints from protected ones.
    else if (AUTH_ENABLED && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/commerce/") || url.pathname.startsWith("/ops/") || url.pathname.startsWith("/auth/"))) {
      const authHeader = req.headers.get("Authorization");
      const certHeader = req.headers.get("X-Certificate");
      const sigHeader = req.headers.get("X-Signature");
      const tsHeader = req.headers.get("X-Timestamp");

      if (certHeader && sigHeader && tsHeader) {
        // Certificate-based auth
        try {
          const cert = JSON.parse(certHeader) as T.Certificate;
          const identity = await S.verifyRequest(db, cert, registryPubKey, REQUIRE_LOCAL_CERTIFICATE_REGISTRY, req.method, url.pathname, tsHeader, sigHeader);
          if (!identity) {
            return response(req, { error: "invalid certificate or signature", code: "invalid" }, { status: 401 });
          }
          // Ensure user record exists for this identity
          const userId = S.ensureUser(db, identity.email);
          authContext = {
            userId,
            scopes: [...S.SELF_SERVICE_SCOPES],
          };
          log("debug", "authenticated", { email: identity.email, userId });
        } catch {
          return response(req, { error: "invalid certificate format", code: "invalid" }, { status: 401 });
        }
      } else if (authHeader?.startsWith("Bearer ")) {
        // Bearer auth supports browser identity sessions and service API keys.
        const key = authHeader.slice(7);
        const sessionAuth = await S.verifyIdentitySession(db, key);
        const auth = sessionAuth || (SUPPORTS_API_KEYS ? await S.verifyApiKey(db, key) : null);
        if (!auth) {
          return response(req, { error: "invalid bearer token", code: "invalid" }, { status: 401 });
        }
        authContext = auth;
      }
    }

    const result = matchRoute(req.method, url.pathname);
    if (!result) {
      log("info", "not found", { method: req.method, path: url.pathname });
      return response(req, { error: "not found", code: "not_found" }, { status: 404 });
    }

    try {
      const res = await runRouteWithTimeout((signal) => result.route.handler(req, result.params, authContext, signal));
      const ms = (performance.now() - start).toFixed(1);
      log("info", "request", { method: req.method, path: url.pathname, status: res.status, ms });
      return applyCors(req, res);
    } catch (err) {
      const ms = (performance.now() - start).toFixed(1);
      log("error", "request failed", { method: req.method, path: url.pathname, error: String(err), ms });
      return response(req, { error: "internal error", code: "internal_error" }, { status: 500 });
    }
  },
});

log("info", "server started", { app: APP_CONFIG.slug, port: server.port, db: DB_PATH, auth: AUTH_ENABLED });
`;
}
