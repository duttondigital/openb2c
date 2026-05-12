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
    const r = await S.createPaymentIntentForBooking(db, +p.id, auth);
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
    const r = await S.createCommercePaymentIntent(db, +p.id, auth);
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
  const webhookSigning = schema.integrations?.webhookEffects?.signing;
  const corsAllowHeaders = [...new Set([
    "Content-Type",
    "Authorization",
    "X-Certificate",
    "X-Signature",
    "X-Timestamp",
    webhookSigning?.timestampHeader || "X-OpenB2C-Timestamp",
    webhookSigning?.signatureHeader || "X-OpenB2C-Signature",
    "Idempotency-Key",
    "If-Match",
    "X-OpenB2C-API-Version",
    "X-Request-ID",
    "X-Correlation-ID",
  ])].join(", ");
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
const REQUEST_ID_HEADER = "X-Request-ID";
const CORRELATION_ID_HEADER = "X-Correlation-ID";
const PRODUCTION = process.env.NODE_ENV === "production";
const ALLOW_INSECURE_AUTH_DISABLED = process.env.ALLOW_INSECURE_AUTH_DISABLED === "true";
const ALLOW_WILDCARD_CORS = process.env.ALLOW_WILDCARD_CORS === "true";
const ALLOW_EPHEMERAL_REGISTRY_KEYS = process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS === "true";
const ALLOW_FAKE_PROVIDERS = process.env.ALLOW_FAKE_PROVIDERS === "true";
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

interface RequestContext {
  requestId: string;
  correlationId: string;
  startedAt: number;
}

function requestHeaderValue(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

function createRequestContext(req: Request): RequestContext {
  const requestId = requestHeaderValue(req.headers.get(REQUEST_ID_HEADER)) || crypto.randomUUID();
  const correlationId = requestHeaderValue(req.headers.get(CORRELATION_ID_HEADER)) || requestId;
  return { requestId, correlationId, startedAt: performance.now() };
}

function requestLogFields(context: RequestContext, req: Request, url: URL, data: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: context.requestId,
    correlationId: context.correlationId,
    method: req.method,
    path: url.pathname,
    ms: (performance.now() - context.startedAt).toFixed(1),
    ...data,
  };
}

function contextLogFields(context: RequestContext, data: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: context.requestId,
    correlationId: context.correlationId,
    ...data,
  };
}

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function identityEmailProvider(): string {
  return (process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
}

function identityOtpSubject(): string {
  return process.env.IDENTITY_OTP_SUBJECT || \`\${APP_CONFIG.name} sign-in code\`;
}

function identityOtpText(code: string): string {
  return [
    \`Your \${APP_CONFIG.name} sign-in code is \${code}.\`,
    "",
    "This code expires in 10 minutes. If you did not request it, you can ignore this email.",
  ].join("\\n");
}

function identityOtpHtml(code: string): string {
  return [
    \`<p>Your sign-in code for \${escapeHtml(APP_CONFIG.name)} is:</p>\`,
    \`<p style="font-size:24px;font-weight:700;letter-spacing:4px">\${escapeHtml(code)}</p>\`,
    "<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>",
  ].join("");
}

interface FakeEmail {
  id: string;
  provider: "fake";
  to: string;
  subject: string;
  text: string;
  html: string;
  challengeId?: number;
  createdAt: string;
}

const FAKE_EMAILS: FakeEmail[] = [];

function fakeProvidersEnabled(): boolean {
  return !PRODUCTION || ALLOW_FAKE_PROVIDERS;
}

function fakeProviderBlocked(provider: string): boolean {
  return PRODUCTION && !ALLOW_FAKE_PROVIDERS && (provider === "fake" || provider === "local");
}

function fakeProviderRequiredEnvBypass(name: string): boolean {
  if (!ALLOW_FAKE_PROVIDERS) return false;
  if (identityEmailProvider() === "fake" && (name === "RESEND_API_KEY" || name === "EMAIL_FROM")) return true;
  const paymentProvider = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  if ((paymentProvider === "fake" || paymentProvider === "local") && name === "PAYMENT_API_KEY") return true;
  return false;
}

async function sendFakeIdentityOtp(email: string, code: string, challengeId: number): Promise<S.Result<{ provider: string; id?: string }>> {
  if (!fakeProvidersEnabled()) {
    return { ok: false, error: "fake email provider is disabled", code: "internal_error" };
  }
  const id = "fake_email_" + crypto.randomUUID();
  FAKE_EMAILS.push({
    id,
    provider: "fake",
    to: email,
    subject: identityOtpSubject(),
    text: identityOtpText(code),
    html: identityOtpHtml(code),
    challengeId,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, data: { provider: "fake", id } };
}

async function sendResendIdentityOtp(email: string, code: string, challengeId: number): Promise<S.Result<{ provider: string; id?: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is required for production identity OTP delivery", code: "internal_error" };
  if (!from) return { ok: false, error: "EMAIL_FROM is required for production identity OTP delivery", code: "internal_error" };

  const res = await fetch(process.env.RESEND_EMAILS_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": \`Bearer \${apiKey}\`,
      "content-type": "application/json",
      "idempotency-key": \`identity-challenge-\${challengeId}\`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: identityOtpSubject(),
      text: identityOtpText(code),
      html: identityOtpHtml(code),
      tags: [
        { name: "openb2c_event", value: "identity_otp" },
        { name: "openb2c_app", value: APP_CONFIG.slug },
      ],
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: \`identity OTP email delivery failed with status \${res.status}\`,
      code: "internal_error",
      details: { provider: "resend", status: String(res.status) },
    };
  }

  let id: string | undefined;
  try {
    const parsed = body ? JSON.parse(body) as { id?: unknown } : {};
    if (typeof parsed.id === "string") id = parsed.id;
  } catch {
    // Resend normally returns JSON. A successful non-JSON proxy response is still deliverable.
  }
  return { ok: true, data: id ? { provider: "resend", id } : { provider: "resend" } };
}

async function sendIdentityChallengeEmail(email: string, code: string, challengeId: number): Promise<S.Result<{ provider: string; id?: string }>> {
  const provider = identityEmailProvider();
  if (provider === "fake") return sendFakeIdentityOtp(email, code, challengeId);
  if (provider === "resend") return sendResendIdentityOtp(email, code, challengeId);
  return { ok: false, error: \`unsupported EMAIL_PROVIDER "\${provider}" for identity OTP delivery\`, code: "internal_error" };
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
  if (fakeProviderBlocked(identityEmailProvider())) {
    errors.push("EMAIL_PROVIDER=fake requires ALLOW_FAKE_PROVIDERS=true in production");
  }
  const configuredPaymentProvider = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  if (fakeProviderBlocked(configuredPaymentProvider)) {
    errors.push("PAYMENT_PROVIDER local/fake requires ALLOW_FAKE_PROVIDERS=true in production");
  }
  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (fakeProviderRequiredEnvBypass(name)) continue;
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

type Handler = (req: Request, params: Record<string, string>, auth: T.AuthContext, signal: AbortSignal, context: RequestContext) => Response | Promise<Response>;

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
  { method: "GET", path: "/ops/fake-emails", handler: (_, __, auth) => {
    if (!fakeProvidersEnabled()) return corsResponse({ error: "fake providers disabled", code: "not_found" }, { status: 404 });
    if (!S.hasScope(auth, "effect.admin")) return corsResponse({ error: "forbidden", code: "forbidden" }, { status: 403 });
    return corsResponse({ items: FAKE_EMAILS });
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
  { method: "POST", path: "/identity/challenge", handler: async (req, _, __, signal, context) => {
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
    log("info", "identity challenge created", contextLogFields(context, { email }));
    // In production, code must be sent via email. In dev, return it for testing.
    if (PRODUCTION) {
      const delivery = await sendIdentityChallengeEmail(email, result.data.code, result.data.challengeId);
      if (!delivery.ok) {
        log("error", "identity challenge email delivery failed", contextLogFields(context, { email, error: delivery.error }));
        return corsResponse(delivery, { status: 502 });
      }
      return corsResponse({ challengeId: result.data.challengeId, message: "verification code sent to email" });
    }
    if (identityEmailProvider() === "fake") {
      await sendIdentityChallengeEmail(email, result.data.code, result.data.challengeId);
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
const CORS_ALLOW_HEADERS = ${JSON.stringify(corsAllowHeaders)};

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
  headers.set("Access-Control-Expose-Headers", "ETag, " + API_VERSION_HEADER + ", " + REQUEST_ID_HEADER + ", " + CORRELATION_ID_HEADER);
  headers.set("Vary", "Origin");
  return headers;
}

function applyRequestContext(res: Response, context?: RequestContext): Response {
  if (!context) return res;
  res.headers.set(REQUEST_ID_HEADER, context.requestId);
  res.headers.set(CORRELATION_ID_HEADER, context.correlationId);
  return res;
}

function applyCors(req: Request, res: Response, context?: RequestContext): Response {
  for (const [k, v] of corsHeaders(req)) {
    res.headers.set(k, v);
  }
  return applyRequestContext(res, context);
}

function response(req: Request, body: unknown, init?: ResponseInit, context?: RequestContext): Response {
  return applyCors(req, corsResponse(body, init), context);
}

function preflightResponse(req: Request, context?: RequestContext): Response {
  if (req.headers.has("origin") && !allowedCorsOrigin(req)) {
    return response(req, { error: "origin not allowed", code: "forbidden" }, { status: 403 }, context);
  }
  return applyRequestContext(new Response(null, { status: 204, headers: corsHeaders(req) }), context);
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
    const context = createRequestContext(req);
    const url = new URL(req.url);
    let authContext: T.AuthContext = AUTH_ENABLED ? T.ANONYMOUS_AUTH_CONTEXT : T.SYSTEM_AUTH_CONTEXT;

    // CORS preflight
    if (req.method === "OPTIONS") {
      const res = preflightResponse(req, context);
      log("info", "request", requestLogFields(context, req, url, { status: res.status }));
      return res;
    }

    // Health check (no auth)
    if (url.pathname === "/health") {
      const res = response(req, { status: "ok", app: APP_CONFIG.slug, version: API_VERSION, db: DB_PATH, auth: AUTH_ENABLED }, undefined, context);
      log("info", "request", requestLogFields(context, req, url, { status: res.status }));
      return res;
    }

    const requestedApiVersion = req.headers.get(API_VERSION_HEADER);
    if (requestedApiVersion && requestedApiVersion !== API_VERSION && hasApiVersionSurface(url.pathname)) {
      const res = response(req, apiVersionError(requestedApiVersion), { status: 400 }, context);
      log("info", "request", requestLogFields(context, req, url, { status: res.status }));
      return res;
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
            const res = response(req, { error: "invalid certificate or signature", code: "invalid" }, { status: 401 }, context);
            log("info", "request", requestLogFields(context, req, url, { status: res.status }));
            return res;
          }
          // Ensure user record exists for this identity
          const userId = S.ensureUser(db, identity.email);
          authContext = {
            userId,
            scopes: [...S.SELF_SERVICE_SCOPES],
          };
          log("debug", "authenticated", contextLogFields(context, { email: identity.email, userId }));
        } catch {
          const res = response(req, { error: "invalid certificate format", code: "invalid" }, { status: 401 }, context);
          log("info", "request", requestLogFields(context, req, url, { status: res.status }));
          return res;
        }
      } else if (authHeader?.startsWith("Bearer ")) {
        // Bearer auth supports browser identity sessions and service API keys.
        const key = authHeader.slice(7);
        const sessionAuth = await S.verifyIdentitySession(db, key);
        const auth = sessionAuth || (SUPPORTS_API_KEYS ? await S.verifyApiKey(db, key) : null);
        if (!auth) {
          const res = response(req, { error: "invalid bearer token", code: "invalid" }, { status: 401 }, context);
          log("info", "request", requestLogFields(context, req, url, { status: res.status }));
          return res;
        }
        authContext = auth;
      }
    }

    const result = matchRoute(req.method, url.pathname);
    if (!result) {
      const res = response(req, { error: "not found", code: "not_found" }, { status: 404 }, context);
      log("info", "not found", requestLogFields(context, req, url, { status: res.status }));
      return res;
    }

    try {
      const res = await runRouteWithTimeout((signal) => result.route.handler(req, result.params, authContext, signal, context));
      log("info", "request", requestLogFields(context, req, url, { status: res.status }));
      return applyCors(req, res, context);
    } catch (err) {
      log("error", "request failed", requestLogFields(context, req, url, { error: String(err) }));
      return response(req, { error: "internal error", code: "internal_error" }, { status: 500 }, context);
    }
  },
});

log("info", "server started", { app: APP_CONFIG.slug, port: server.port, db: DB_PATH, auth: AUTH_ENABLED });
`;
}
