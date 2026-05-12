import type { Column, DerivedField, EcommerceConfig, FieldRef, Operation, Schema, Tables } from "./types";
import { pascalCase, camelCase, getEcommerceConfig, hasCommerceWorkflow, hasCommerceBookingAliases } from "./utils";
import { compileExpr, extractRelations } from "./expr";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);

function sqlIdent(name: string): string {
  return `[${name.replace(/]/g, "]]")}]`;
}

function requireEcommerceField(path: string, ref: FieldRef | null | undefined): FieldRef {
  if (!ref) throw new Error(`ecommerce.${path} is required`);
  return ref;
}

function requireEcommerceEntity(path: string, value: string): string {
  if (!value) throw new Error(`ecommerce.${path} is required`);
  return value;
}

function referencedEntity(ref: FieldRef): string | null {
  const referenceEntity = ref.references?.match(/^([a-z_]+)\(/)?.[1];
  if (referenceEntity) return referenceEntity;
  return ref.field.endsWith("_id") ? ref.field.slice(0, -3) : null;
}

function ecommerceRuntimeConfig(schema: Schema): Record<string, unknown> {
  const ecommerce = getEcommerceConfig(schema);
  if (!ecommerce) throw new Error("ecommerce config is required for commerce generation");
  return normalizeEcommerceConfig(ecommerce);
}

function normalizeEcommerceConfig(ecommerce: EcommerceConfig): Record<string, unknown> {
  const catalogEntity = requireEcommerceEntity("catalog.entity", ecommerce.catalog.entity);
  const orderEntity = requireEcommerceEntity("order.entity", ecommerce.order.entity);
  const lineItemEntity = requireEcommerceEntity("lineItem.entity", ecommerce.lineItem.entity);
  const orderLineEntity = requireEcommerceEntity("orderLine.entity", ecommerce.orderLine.entity);
  const transactionEntity = requireEcommerceEntity("transaction.entity", ecommerce.transaction.entity);
  const transactionLineEntity = requireEcommerceEntity("transactionLine.entity", ecommerce.transactionLine.entity);
  const orderUser = requireEcommerceField("order.user", ecommerce.order.user);

  return {
    catalog: {
      entity: catalogEntity,
      table: sqlIdent(catalogEntity),
      title: ecommerce.catalog.title,
      description: ecommerce.catalog.description,
      price: requireEcommerceField("catalog.price", ecommerce.catalog.price),
      groupBy: ecommerce.catalog.groupBy,
      variantFields: ecommerce.catalog.variantFields,
      availability: {
        field: ecommerce.catalog.availability.field,
        available: ecommerce.catalog.availability.available,
      },
    },
    order: {
      entity: orderEntity,
      table: sqlIdent(orderEntity),
      user: orderUser,
      userTable: referencedEntity(orderUser) ? sqlIdent(referencedEntity(orderUser)!) : null,
      status: requireEcommerceField("order.status", ecommerce.order.status),
      amount: requireEcommerceField("order.amount", ecommerce.order.amount),
      currency: requireEcommerceField("order.currency", ecommerce.order.currency),
      expiresAt: requireEcommerceField("order.expiresAt", ecommerce.order.expiresAt),
      paymentReference: requireEcommerceField("order.paymentReference", ecommerce.order.paymentReference),
      client: ecommerce.order.client,
      pendingStatus: ecommerce.order.pendingStatus,
      paidStatus: ecommerce.order.paidStatus,
      expiredStatus: ecommerce.order.expiredStatus,
      cancelledStatus: ecommerce.order.cancelledStatus,
    },
    lineItem: {
      entity: lineItemEntity,
      table: sqlIdent(lineItemEntity),
      catalogItem: requireEcommerceField("lineItem.catalogItem", ecommerce.lineItem.catalogItem),
      user: ecommerce.lineItem.user,
      price: requireEcommerceField("lineItem.price", ecommerce.lineItem.price),
      status: requireEcommerceField("lineItem.status", ecommerce.lineItem.status),
      quantity: ecommerce.lineItem.quantity,
      reservedStatus: ecommerce.lineItem.reservedStatus,
      fulfilledStatus: ecommerce.lineItem.fulfilledStatus,
      cancelledStatus: ecommerce.lineItem.cancelledStatus,
      options: ecommerce.lineItem.options,
    },
    orderLine: {
      entity: orderLineEntity,
      table: sqlIdent(orderLineEntity),
      order: requireEcommerceField("orderLine.order", ecommerce.orderLine.order),
      lineItem: requireEcommerceField("orderLine.lineItem", ecommerce.orderLine.lineItem),
    },
    transaction: {
      entity: transactionEntity,
      table: sqlIdent(transactionEntity),
      user: requireEcommerceField("transaction.user", ecommerce.transaction.user),
      amount: requireEcommerceField("transaction.amount", ecommerce.transaction.amount),
      type: ecommerce.transaction.type,
      status: requireEcommerceField("transaction.status", ecommerce.transaction.status),
      reference: requireEcommerceField("transaction.reference", ecommerce.transaction.reference),
      client: ecommerce.transaction.client,
      purchaseType: ecommerce.transaction.purchaseType,
      pendingStatus: ecommerce.transaction.pendingStatus,
      completedStatus: ecommerce.transaction.completedStatus,
      failedStatus: ecommerce.transaction.failedStatus,
    },
    transactionLine: {
      entity: transactionLineEntity,
      table: sqlIdent(transactionLineEntity),
      transaction: requireEcommerceField("transactionLine.transaction", ecommerce.transactionLine.transaction),
      lineItem: requireEcommerceField("transactionLine.lineItem", ecommerce.transactionLine.lineItem),
    },
    checkout: ecommerce.checkout,
  };
}

function defaultOperation(): Operation {
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, audit: {}, set: {}, cascade: [], effects: [] };
}

function concurrencyFields(schema: Schema): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [entity, columns] of Object.entries(schema.tables)) {
    if (columns.updated_at) fields[entity] = "updated_at";
  }
  return fields;
}

function operationsForEntity(schema: Schema, entity: string): Record<string, Operation> {
  return {
    read: defaultOperation(),
    create: defaultOperation(),
    update: defaultOperation(),
    delete: defaultOperation(),
    ...(schema.operations[entity] || {}),
  };
}

function operationScope(entity: string, action: string, op: Operation): string {
  return op.scope ?? `${entity}.${action}`;
}

function operationPolicies(schema: Schema): Record<string, Record<string, unknown>> {
  const policies: Record<string, Record<string, unknown>> = {};
  for (const entity of Object.keys(schema.tables)) {
    policies[entity] = {};
    for (const [action, op] of Object.entries(operationsForEntity(schema, entity))) {
      policies[entity][action] = {
        scope: operationScope(entity, action, op),
        public: op.public,
        relationships: op.relationships,
      };
    }
  }
  return policies;
}

function operationAuditRequirement(schema: Schema, entity: string, action: string, op: Operation): Record<string, unknown> | null {
  const entityAudit = schema.audit?.entities?.[entity];
  const explicit = op.audit || {};
  const required = Boolean(explicit.required || entityAudit?.operations?.includes(action));
  if (!required) return null;
  return {
    required: true,
    category: explicit.category || entityAudit?.category || "data",
    ...(explicit.reason || entityAudit?.reason ? { reason: explicit.reason || entityAudit?.reason } : {}),
  };
}

function auditRequirements(schema: Schema): Record<string, Record<string, unknown>> {
  const requirements: Record<string, Record<string, unknown>> = {};
  for (const entity of Object.keys(schema.tables)) {
    for (const [action, op] of Object.entries(operationsForEntity(schema, entity))) {
      if (action === "read") continue;
      const audit = operationAuditRequirement(schema, entity, action, op);
      if (!audit) continue;
      requirements[entity] ||= {};
      requirements[entity][action] = audit;
    }
  }
  return requirements;
}

function selfServiceScopes(schema: Schema): string[] {
  const scopes = new Set<string>();
  for (const entity of Object.keys(schema.tables)) {
    for (const [action, op] of Object.entries(operationsForEntity(schema, entity))) {
      if (!op.public && op.relationships.length > 0) {
        scopes.add(operationScope(entity, action, op));
      }
    }
  }
  return [...scopes].sort();
}

function fieldValidationRules(schema: Schema): Record<string, Record<string, unknown>> {
  const rules: Record<string, Record<string, unknown>> = {};
  for (const [entity, columns] of Object.entries(schema.tables)) {
    const entityRules: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(columns)) {
      const metadata = column.metadata || {};
      const validation = column.validation || {};
      const rule: Record<string, unknown> = {};
      if (metadata.label) rule.label = metadata.label;
      if (metadata.format) rule.format = metadata.format;
      if (validation.minLength !== null && validation.minLength !== undefined) rule.minLength = validation.minLength;
      if (validation.maxLength !== null && validation.maxLength !== undefined) rule.maxLength = validation.maxLength;
      if (validation.minimum !== null && validation.minimum !== undefined) rule.minimum = validation.minimum;
      if (validation.maximum !== null && validation.maximum !== undefined) rule.maximum = validation.maximum;
      if (validation.pattern) rule.pattern = validation.pattern;
      if (validation.enum?.length) rule.enum = validation.enum;
      if (Object.keys(rule).length > 0) entityRules[field] = rule;
    }
    if (Object.keys(entityRules).length > 0) rules[entity] = entityRules;
  }
  return rules;
}

function crossFieldValidationCases(schema: Schema): string {
  const cases: string[] = [];
  for (const [entity, constraints] of Object.entries(schema.validations || {})) {
    const checks: string[] = [];
    for (const constraint of Object.values(constraints)) {
      checks.push(`    if (!(${compileExpr(constraint.expression, "record")})) return ${JSON.stringify(constraint.message)};`);
    }
    if (checks.length > 0) {
      cases.push(`    case ${JSON.stringify(entity)}:\n${checks.join("\n")}\n      return null;`);
    }
  }
  return cases.join("\n");
}

function templateExpression(template: string): string {
  const parts: string[] = [];
  let cursor = 0;
  const pattern = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  for (const match of template.matchAll(pattern)) {
    if (match.index > cursor) parts.push(JSON.stringify(template.slice(cursor, match.index)));
    parts.push(`String(record[${JSON.stringify(match[1])}] ?? "")`);
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) parts.push(JSON.stringify(template.slice(cursor)));
  return parts.length ? parts.join(" + ") : JSON.stringify(template);
}

function derivedAssignment(field: string, derived: DerivedField): string {
  if (derived.template) return `      record[${JSON.stringify(field)}] = ${templateExpression(derived.template)};`;
  if (derived.expression) return `      record[${JSON.stringify(field)}] = ${compileExpr(derived.expression, "record")};`;
  return `      record[${JSON.stringify(field)}] = null;`;
}

function derivedFieldCases(schema: Schema): string {
  const cases: string[] = [];
  for (const [entity, fields] of Object.entries(schema.derived || {})) {
    const assignments = Object.entries(fields).map(([field, derived]) => derivedAssignment(field, derived));
    if (assignments.length > 0) {
      cases.push(`    case ${JSON.stringify(entity)}:\n${assignments.join("\n")}\n      return record;`);
    }
  }
  return cases.join("\n");
}

function genServiceImports(schema: Schema): string {
  const policy = JSON.stringify(operationPolicies(schema), null, 2);
  const selfScopes = JSON.stringify(selfServiceScopes(schema), null, 2);
  const concurrency = JSON.stringify(concurrencyFields(schema), null, 2);
  const audit = JSON.stringify(auditRequirements(schema), null, 2);
  const validationRules = JSON.stringify(fieldValidationRules(schema), null, 2);
  const crossFieldCases = crossFieldValidationCases(schema);
  const crossFieldSwitchCases = `${crossFieldCases}${crossFieldCases ? "\n" : ""}    default:\n      return null;`;
  const derivedCases = derivedFieldCases(schema);
  const derivedSwitchCases = `${derivedCases}${derivedCases ? "\n" : ""}    default:\n      return record;`;
  return `import { Database } from "bun:sqlite";
import * as T from "./types";

export type ErrorCode =
  | "not_found"
  | "malformed"
  | "invalid"
  | "bad_state"
  | "conflict"
  | "internal_error"
  | "unsupported_version"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media_type"
  | "timeout";

export type Result<D> =
  | { ok: true; data: D }
  | { ok: false; error: string; code: ErrorCode; details?: Record<string, string> };

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

export interface AuditContext {
  source?: "rest" | "mcp" | "service";
}

export interface AuditRequirement {
  required: true;
  category: "data" | "workflow" | "security" | "payment" | "system";
  reason?: string;
}

const AUDIT_REQUIREMENTS: Record<string, Record<string, AuditRequirement>> = ${audit};
let auditLogReady = false;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function ensureAuditLogTable(db: Database) {
  if (auditLogReady) return;
  db.run(\`
    CREATE TABLE IF NOT EXISTS openb2c_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id INTEGER,
      category TEXT NOT NULL,
      reason TEXT,
      actor_user_id INTEGER,
      source TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  \`);
  db.run("CREATE INDEX IF NOT EXISTS openb2c_audit_log_entity_record ON openb2c_audit_log (entity, record_id, created_at)");
  db.run("CREATE INDEX IF NOT EXISTS openb2c_audit_log_actor ON openb2c_audit_log (actor_user_id, created_at)");
  auditLogReady = true;
}

export function writeAuditLog(
  db: Database,
  entity: string,
  action: string,
  recordId: number | null,
  auth: T.AuthContext,
  result: unknown,
  context: AuditContext = {},
): { logged: boolean; id?: number } {
  const requirement = AUDIT_REQUIREMENTS[entity]?.[action];
  if (!requirement?.required) return { logged: false };
  ensureAuditLogTable(db);
  const row = db.query<{ id: number }, [string, string, number | null, string, string | null, number | null, string, string]>(\`
    INSERT INTO openb2c_audit_log
      (entity, action, record_id, category, reason, actor_user_id, source, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  \`).get(
    entity,
    action,
    recordId,
    requirement.category,
    requirement.reason ?? null,
    auth.userId,
    context.source || "service",
    json(result),
  );
  if (!row) throw new Error("failed to write audit log");
  return { logged: true, id: row.id };
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

type FieldValidationRule = {
  label?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: readonly string[];
};

const FIELD_VALIDATION_RULES: Record<string, Record<string, FieldValidationRule>> = ${validationRules};

function validate(input: Record<string, unknown>, entity?: string, current?: Record<string, unknown>): string | null {
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
  if (entity) {
    for (const [field, rule] of Object.entries(FIELD_VALIDATION_RULES[entity] || {})) {
      if (input[field] === undefined || input[field] === null) continue;
      const error = validateField(field, input[field], rule);
      if (error) return error;
    }
    const crossFieldError = validateCrossField(entity, input, current);
    if (crossFieldError) return crossFieldError;
  }
  return null;
}

function validateCrossField(entity: string, input: Record<string, unknown>, current?: Record<string, unknown>): string | null {
  const record = current ? { ...current, ...input } : input;
  switch (entity) {
${crossFieldSwitchCases}
  }
}

function validateField(field: string, value: unknown, rule: FieldValidationRule): string | null {
  const label = rule.label || field;
  const text = typeof value === "string" ? value : String(value);
  if (rule.enum?.length && !rule.enum.includes(text)) return \`\${label} must be one of: \${rule.enum.join(", ")}\`;
  if (rule.minLength !== undefined && text.length < rule.minLength) return \`\${label} must be at least \${rule.minLength} characters\`;
  if (rule.maxLength !== undefined && text.length > rule.maxLength) return \`\${label} must be at most \${rule.maxLength} characters\`;
  if (rule.pattern && !new RegExp(rule.pattern).test(text)) return \`\${label} has an invalid format\`;

  const numeric = typeof value === "number" ? value : Number(value);
  if (rule.minimum !== undefined && (!Number.isFinite(numeric) || numeric < rule.minimum)) return \`\${label} must be at least \${rule.minimum}\`;
  if (rule.maximum !== undefined && (!Number.isFinite(numeric) || numeric > rule.maximum)) return \`\${label} must be at most \${rule.maximum}\`;

  switch (rule.format) {
    case "email":
      return validateEmail(text) ? null : \`\${label} must be a valid email address\`;
    case "postcode":
      return validatePostcode(text) ? null : \`\${label} must be a valid UK postcode\`;
    case "phone":
      return validatePhone(text) ? null : \`\${label} must be a valid UK phone number\`;
    case "date":
      return validateDate(text) ? null : \`\${label} must use YYYY-MM-DD\`;
    case "time":
      return validateTime(text) ? null : \`\${label} must use HH:MM\`;
    case "url":
      try {
        new URL(text);
        return null;
      } catch {
        return \`\${label} must be a valid URL\`;
      }
    default:
      return null;
  }
}

function withDerived(entity: string, row: Record<string, unknown>): Record<string, unknown> {
  const record = { ...row };
  switch (entity) {
${derivedSwitchCases}
  }
}

// ============================================================================
// Auth
// ============================================================================

export function generateApiKey(): string {
  return generateSecretToken("do_");
}

export async function hashApiKey(key: string): Promise<string> {
  return Bun.password.hash(key, { algorithm: "bcrypt", cost: 10 });
}

export const SELF_SERVICE_SCOPES = ${selfScopes} as const;

function generateSecretToken(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyApiKey(db: Database, key: string): Promise<T.AuthContext | null> {
  // Use key prefix to narrow candidates, then bcrypt verify
  const prefix = key.slice(0, 11);
  const rows = db.query(\`
    SELECT id, user_id, scopes, active, expires_at, key_hash
    FROM api_key WHERE active = 1 AND key_prefix = ?
  \`).all(prefix) as { id: number; user_id: number; scopes: string; active: number; expires_at: string | null; key_hash: string }[];

  for (const row of rows) {
    if (row.expires_at && new Date(row.expires_at) < new Date()) continue;
    const valid = await Bun.password.verify(key, row.key_hash);
    if (valid) {
      // Update last_used_at
      db.query("UPDATE api_key SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
      return {
        userId: row.user_id,
        scopes: row.scopes.split(",").map(s => s.trim()).filter(Boolean),
      };
    }
  }
  return null;
}

export function generateIdentitySessionToken(): string {
  return generateSecretToken("sess_");
}

export async function issueIdentitySession(
  db: Database,
  userId: number,
  validForMs = 30 * 24 * 60 * 60 * 1000
): Promise<Result<{ token: string; expiresAt: string }>> {
  const token = generateIdentitySessionToken();
  const tokenHash = await Bun.password.hash(token, { algorithm: "bcrypt", cost: 10 });
  const tokenPrefix = token.slice(0, 16);
  const expiresAt = new Date(Date.now() + validForMs).toISOString();

  db.query(\`
    INSERT INTO identity_session (user_id, token_hash, token_prefix, expires_at)
    VALUES (?, ?, ?, ?)
  \`).run(userId, tokenHash, tokenPrefix, expiresAt);

  return { ok: true, data: { token, expiresAt } };
}

export async function verifyIdentitySession(db: Database, token: string): Promise<T.AuthContext | null> {
  if (!token.startsWith("sess_")) return null;
  const tokenPrefix = token.slice(0, 16);
  const rows = db.query(\`
    SELECT id, user_id, token_hash, expires_at
    FROM identity_session
    WHERE revoked = 0 AND token_prefix = ?
  \`).all(tokenPrefix) as { id: number; user_id: number; token_hash: string; expires_at: string }[];

  for (const row of rows) {
    if (new Date(row.expires_at) < new Date()) continue;
    const valid = await Bun.password.verify(token, row.token_hash);
    if (valid) {
      db.query("UPDATE identity_session SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
      return {
        userId: row.user_id,
        scopes: [...SELF_SERVICE_SCOPES],
      };
    }
  }
  return null;
}

export async function revokeIdentitySessionToken(db: Database, token: string): Promise<Result<{ revoked: boolean }>> {
  if (!token.startsWith("sess_")) {
    return { ok: false, error: "identity session not found", code: "not_found" };
  }
  const tokenPrefix = token.slice(0, 16);
  const rows = db.query(\`
    SELECT id, token_hash
    FROM identity_session
    WHERE revoked = 0 AND token_prefix = ?
  \`).all(tokenPrefix) as { id: number; token_hash: string }[];

  for (const row of rows) {
    if (await Bun.password.verify(token, row.token_hash)) {
      db.query("UPDATE identity_session SET revoked = 1 WHERE id = ?").run(row.id);
      return { ok: true, data: { revoked: true } };
    }
  }

  return { ok: false, error: "identity session not found", code: "not_found" };
}

export function hasScope(ctx: T.AuthContext, required: string): boolean {
  return ctx.scopes.includes("*") || ctx.scopes.includes(required);
}

// ============================================================================
// Authorization
// ============================================================================

const OPERATION_POLICY = ${policy} as Record<string, Record<string, T.OperationPolicy>>;

export type AuthorizationAction = string;

export interface AuthorizationScope {
  denied: boolean;
  unrestricted: boolean;
  relationshipFields: string[];
}

function getActionPolicy(entity: string, action: AuthorizationAction): T.OperationPolicy | null {
  return OPERATION_POLICY[entity]?.[action] ?? null;
}

function relationshipFields(policy: T.OperationPolicy | null): string[] {
  return [...new Set((policy?.relationships ?? []).map(rel => rel.field.field))];
}

function matchesRelationship(auth: T.AuthContext, policy: T.OperationPolicy, record?: Record<string, unknown>): boolean {
  if (auth.scopes.includes("*")) return true;
  if (policy.relationships.length === 0) return true;
  if (auth.userId === null || !record) return false;
  return policy.relationships.some(rel => Number(record[rel.field.field]) === auth.userId);
}

export function operationRelationshipFields(entity: string, action: AuthorizationAction): string[] {
  return relationshipFields(getActionPolicy(entity, action));
}

export function can(entity: string, action: AuthorizationAction, auth: T.AuthContext, record?: Record<string, unknown>): boolean {
  const policy = getActionPolicy(entity, action);
  if (!policy) return true;
  if (policy.public) return true;
  return hasScope(auth, policy.scope) && matchesRelationship(auth, policy, record);
}

export function authorizationScope(entity: string, action: AuthorizationAction, auth: T.AuthContext): AuthorizationScope {
  const policy = getActionPolicy(entity, action);
  if (!policy || policy.public) return { denied: false, unrestricted: true, relationshipFields: [] };
  if (!hasScope(auth, policy.scope)) return { denied: true, unrestricted: false, relationshipFields: [] };
  if (auth.scopes.includes("*")) return { denied: false, unrestricted: true, relationshipFields: [] };
  const fields = relationshipFields(policy);
  if (fields.length === 0) return { denied: false, unrestricted: true, relationshipFields: [] };
  if (auth.userId === null) return { denied: true, unrestricted: false, relationshipFields: [] };
  return { denied: false, unrestricted: false, relationshipFields: fields };
}

export function authorizationError<D>(entity: string, action: AuthorizationAction, auth: T.AuthContext): Result<D> {
  const code: ErrorCode = auth.userId === null && !auth.scopes.includes("*") ? "unauthorized" : "forbidden";
  return { ok: false, error: \`not authorized to \${action} \${entity}\`, code };
}

export function authorizeCollection(entity: string, action: AuthorizationAction, auth: T.AuthContext): Result<true> {
  const scope = authorizationScope(entity, action, auth);
  if (scope.denied) return authorizationError(entity, action, auth);
  return { ok: true, data: true };
}

export function statusForResult(result: Result<unknown>): number {
  if (result.ok) return 200;
  switch (result.code) {
    case "unauthorized": return 401;
    case "forbidden": return 403;
    case "rate_limited": return 429;
    case "payload_too_large": return 413;
    case "unsupported_media_type": return 415;
    case "timeout": return 504;
    case "not_found": return 404;
    case "conflict": return 409;
    case "bad_state": return 409;
    case "malformed": return 400;
    case "unsupported_version": return 400;
    case "internal_error": return 500;
    case "invalid":
      return 422;
    default:
      return 500;
  }
}

const CONCURRENCY_FIELDS: Record<string, string> = ${concurrency};

function concurrencyHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function entityTagForRecord(entity: string, record: Record<string, unknown>): string | null {
  const field = CONCURRENCY_FIELDS[entity];
  if (!field) return null;
  const value = record[field];
  if (value === undefined || value === null) return null;
  return \`"\${entity}:\${String(record.id ?? "")}:\${concurrencyHash(String(value))}"\`;
}

function matchesIfMatch(entity: string, record: Record<string, unknown>, ifMatch?: string | null): boolean {
  if (!ifMatch) return true;
  const current = entityTagForRecord(entity, record);
  if (!current) return true;
  return ifMatch
    .split(",")
    .map(candidate => candidate.trim())
    .some(candidate => candidate === "*" || candidate === current || candidate === \`W/\${current}\`);
}

function concurrencyConflict<D>(): Result<D> {
  return {
    ok: false,
    error: "record has changed",
    code: "conflict",
    details: { if_match: "refresh the record and retry with its current ETag" },
  };
}

// ============================================================================
// Identity (Federated Auth)
// ============================================================================

export interface VerifiedIdentity {
  email: string;
  publicKey: string;
  certificate: T.Certificate;
}

// Ensure user exists for identity, create if not
export function ensureUser(db: Database, email: string): number {
  const existing = db.query("SELECT id FROM user WHERE email = ?").get(email) as { id: number } | null;
  if (existing) return existing.id;

  // Auto-create user on first authenticated request
  const result = db.query(\`
    INSERT INTO user (name, email)
    VALUES (?, ?)
    RETURNING id
  \`).get(email, email) as { id: number };

  return result.id;
}

// Registry keypair - in production, load from secure storage
let registryPrivateKey: CryptoKey | null = null;
let registryPublicKey: CryptoKey | null = null;

export async function initRegistryKeys(privateKeyHex?: string): Promise<string> {
  if (privateKeyHex) {
    // Import existing key
    const keyData = hexToBytes(privateKeyHex);
    registryPrivateKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "Ed25519" }, false, ["sign"]
    );
    // Derive public key (Ed25519 public key is last 32 bytes of 64-byte private key or derived)
    const publicKeyData = keyData.slice(32);
    registryPublicKey = await crypto.subtle.importKey(
      "raw", publicKeyData, { name: "Ed25519" }, true, ["verify"]
    );
    return bytesToHex(publicKeyData);
  } else {
    // Generate new keypair
    const keypair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    registryPrivateKey = keypair.privateKey;
    registryPublicKey = keypair.publicKey;
    const pubKeyBytes = await crypto.subtle.exportKey("raw", keypair.publicKey);
    return bytesToHex(new Uint8Array(pubKeyBytes));
  }
}

export async function getRegistryPublicKey(): Promise<string> {
  if (!registryPublicKey) throw new Error("Registry keys not initialized");
  const bytes = await crypto.subtle.exportKey("raw", registryPublicKey);
  return bytesToHex(new Uint8Array(bytes));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function generateOTP(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map(b => (b % 10).toString()).join("").padStart(6, "0");
}

export async function hashOTP(code: string): Promise<string> {
  return Bun.password.hash(code, { algorithm: "bcrypt", cost: 10 });
}

const IDENTITY_CHALLENGE_LIMITS = {
  windowSeconds: 10 * 60,
  email: 3,
  publicKey: 3,
  ipAddress: 10,
} as const;

const IDENTITY_VERIFICATION_LIMITS = {
  windowSeconds: 10 * 60,
  challenge: 5,
  email: 10,
} as const;

function recentChallengeCount(db: Database, column: "email" | "public_key" | "ip_address", value: string): number {
  const row = db.query(\`
    SELECT COUNT(*) as n FROM identity_challenge
    WHERE \${column} = ? AND created_at >= datetime('now', ?)
  \`).get(value, \`-\${IDENTITY_CHALLENGE_LIMITS.windowSeconds} seconds\`) as { n: number };
  return row.n;
}

function checkChallengeCreationRateLimit(db: Database, email: string, publicKey: string, ipAddress: string): Result<true> {
  if (recentChallengeCount(db, "email", email) >= IDENTITY_CHALLENGE_LIMITS.email) {
    return { ok: false, error: "too many identity challenges for email", code: "rate_limited" };
  }
  if (recentChallengeCount(db, "public_key", publicKey) >= IDENTITY_CHALLENGE_LIMITS.publicKey) {
    return { ok: false, error: "too many identity challenges for public key", code: "rate_limited" };
  }
  if (recentChallengeCount(db, "ip_address", ipAddress) >= IDENTITY_CHALLENGE_LIMITS.ipAddress) {
    return { ok: false, error: "too many identity challenges for IP address", code: "rate_limited" };
  }
  return { ok: true, data: true };
}

function recentVerificationAttemptCount(db: Database, column: "challenge_id" | "email", value: number | string): number {
  const row = db.query(\`
    SELECT COUNT(*) as n FROM identity_verification_attempt
    WHERE \${column} = ? AND created_at >= datetime('now', ?)
  \`).get(value, \`-\${IDENTITY_VERIFICATION_LIMITS.windowSeconds} seconds\`) as { n: number };
  return row.n;
}

function checkVerificationRateLimit(db: Database, challengeId: number, email: string): Result<true> {
  if (recentVerificationAttemptCount(db, "challenge_id", challengeId) >= IDENTITY_VERIFICATION_LIMITS.challenge) {
    return { ok: false, error: "too many identity verification attempts for challenge", code: "rate_limited" };
  }
  if (recentVerificationAttemptCount(db, "email", email) >= IDENTITY_VERIFICATION_LIMITS.email) {
    return { ok: false, error: "too many identity verification attempts for email", code: "rate_limited" };
  }
  return { ok: true, data: true };
}

function recordVerificationAttempt(db: Database, challengeId: number, email: string): void {
  db.query(\`
    INSERT INTO identity_verification_attempt (challenge_id, email)
    VALUES (?, ?)
  \`).run(challengeId, email);
}

export function cleanupIdentityChallenges(db: Database): { deleted: number } {
  const result = db.query(\`
    DELETE FROM identity_challenge
    WHERE used = 1 OR datetime(expires_at) < datetime('now')
  \`).run() as { changes: number };
  return { deleted: result.changes };
}

export async function createChallenge(
  db: Database,
  email: string,
  publicKey: string,
  ipAddress = "unknown"
): Promise<Result<{ challengeId: number; code: string }>> {
  cleanupIdentityChallenges(db);
  const rateLimit = checkChallengeCreationRateLimit(db, email, publicKey, ipAddress);
  if (!rateLimit.ok) return rateLimit;

  const code = generateOTP();
  const codeHash = await hashOTP(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const result = db.query(\`
    INSERT INTO identity_challenge (email, code_hash, public_key, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?) RETURNING id
  \`).get(email, codeHash, publicKey, ipAddress, expiresAt) as { id: number };

  return { ok: true, data: { challengeId: result.id, code } };
}

export async function verifyChallenge(
  db: Database,
  challengeId: number,
  code: string,
  signature: string  // signature of the code, proves key ownership
): Promise<Result<T.Certificate>> {
  const challenge = db.query(\`
    SELECT * FROM identity_challenge WHERE id = ? AND used = 0
  \`).get(challengeId) as { email: string; code_hash: string; public_key: string; expires_at: string } | null;

  if (!challenge) {
    return { ok: false, error: "invalid or used challenge", code: "invalid" };
  }

  const rateLimit = checkVerificationRateLimit(db, challengeId, challenge.email);
  if (!rateLimit.ok) return rateLimit;
  recordVerificationAttempt(db, challengeId, challenge.email);

  if (new Date(challenge.expires_at) < new Date()) {
    return { ok: false, error: "challenge expired", code: "invalid" };
  }

  const codeValid = await Bun.password.verify(code, challenge.code_hash);
  if (!codeValid) {
    return { ok: false, error: "incorrect code", code: "invalid" };
  }

  // Verify signature proves ownership of private key
  const publicKeyBytes = hexToBytes(challenge.public_key);
  const publicKey = await crypto.subtle.importKey(
    "raw", publicKeyBytes, { name: "Ed25519" }, false, ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "Ed25519", publicKey,
    hexToBytes(signature),
    new TextEncoder().encode(code)
  );

  if (!valid) {
    return { ok: false, error: "invalid signature", code: "invalid" };
  }

  // Mark challenge as used
  db.query("UPDATE identity_challenge SET used = 1 WHERE id = ?").run(challengeId);
  cleanupIdentityChallenges(db);

  upsertIdentityRegistry(db, challenge.email, challenge.public_key);

  // Issue certificate
  const cert = await issueCertificate(challenge.email, challenge.public_key);

  return { ok: true, data: cert };
}

export interface IdentityRegistryUpdate {
  rotated: boolean;
  reissued: boolean;
}

export function upsertIdentityRegistry(db: Database, email: string, publicKey: string): IdentityRegistryUpdate {
  const existing = db.query("SELECT public_key FROM identity_registry WHERE email = ?")
    .get(email) as { public_key: string } | null;

  db.query(\`
    INSERT INTO identity_registry (email, public_key)
    VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET public_key = ?, verified_at = CURRENT_TIMESTAMP, revoked = 0
  \`).run(email, publicKey, publicKey);

  return {
    rotated: existing !== null && existing.public_key !== publicKey,
    reissued: existing !== null && existing.public_key === publicKey,
  };
}

export async function issueCertificate(email: string, publicKey: string, validForMs = 365 * 24 * 60 * 60 * 1000): Promise<T.Certificate> {
  if (!registryPrivateKey) throw new Error("Registry keys not initialized");

  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + validForMs).toISOString();

  const payload = JSON.stringify({ email, publicKey, issuedAt, expiresAt });
  const signature = await crypto.subtle.sign(
    "Ed25519", registryPrivateKey,
    new TextEncoder().encode(payload)
  );

  return {
    email,
    publicKey,
    issuedAt,
    expiresAt,
    signature: bytesToHex(new Uint8Array(signature)),
  };
}

export async function verifyCertificate(cert: T.Certificate, registryPubKeyHex: string): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw", hexToBytes(registryPubKeyHex), { name: "Ed25519" }, false, ["verify"]
    );

    const payload = JSON.stringify({
      email: cert.email,
      publicKey: cert.publicKey,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
    });

    const valid = await crypto.subtle.verify(
      "Ed25519", publicKey,
      hexToBytes(cert.signature),
      new TextEncoder().encode(payload)
    );

    if (!valid) return false;
    if (new Date(cert.expiresAt) < new Date()) return false;

    return true;
  } catch {
    return false;
  }
}

export type CertificateRegistryState = "active" | "revoked" | "missing";

export function getCertificateRegistryState(db: Database, cert: T.Certificate): CertificateRegistryState {
  const row = db.query(\`
    SELECT revoked FROM identity_registry
    WHERE email = ? AND public_key = ?
  \`).get(cert.email, cert.publicKey) as { revoked: number } | null;

  if (!row) return "missing";
  return row.revoked === 1 ? "revoked" : "active";
}

export function isCertificateRevoked(db: Database, cert: T.Certificate): boolean {
  return getCertificateRegistryState(db, cert) === "revoked";
}

export function revokeCertificate(db: Database, cert: T.Certificate): Result<{ revoked: boolean }> {
  const result = db.query(\`
    UPDATE identity_registry
    SET revoked = 1
    WHERE email = ? AND public_key = ?
  \`).run(cert.email, cert.publicKey) as { changes: number };

  if (result.changes === 0) {
    return { ok: false, error: "certificate not found", code: "not_found" };
  }

  return { ok: true, data: { revoked: true } };
}

function consumeRequestSignature(db: Database, signature: string): boolean {
  db.query(\`
    DELETE FROM identity_request_signature
    WHERE created_at < datetime('now', '-5 minutes')
  \`).run();

  try {
    db.query("INSERT INTO identity_request_signature (signature) VALUES (?)").run(signature);
    return true;
  } catch {
    return false;
  }
}

export async function verifyRequest(
  db: Database,
  cert: T.Certificate,
  registryPubKeyHex: string,
  requireLocalRegistry: boolean,
  method: string,
  path: string,
  timestamp: string,
  signature: string
): Promise<VerifiedIdentity | null> {
  // 1. Verify certificate is valid and signed by registry
  const certValid = await verifyCertificate(cert, registryPubKeyHex);
  if (!certValid) return null;
  const registryState = getCertificateRegistryState(db, cert);
  if (registryState === "revoked") return null;
  if (requireLocalRegistry && registryState !== "active") return null;

  // 2. Verify request signature using user's public key from cert
  try {
    const userPubKey = await crypto.subtle.importKey(
      "raw", hexToBytes(cert.publicKey), { name: "Ed25519" }, false, ["verify"]
    );

    const message = \`\${method} \${path} \${timestamp}\`;
    const valid = await crypto.subtle.verify(
      "Ed25519", userPubKey,
      hexToBytes(signature),
      new TextEncoder().encode(message)
    );

    if (!valid) return null;

    // 3. Check timestamp is recent (5 min window)
    const ts = parseInt(timestamp);
    const now = Date.now();
    if (Math.abs(now - ts) > 5 * 60 * 1000) return null;
    if (!consumeRequestSignature(db, signature)) return null;

    return { email: cert.email, publicKey: cert.publicKey, certificate: cert };
  } catch {
    return null;
  }
}
`;
}

function genCrudService(entity: string, cols: Record<string, Column>): string {
  const Entity = pascalCase(entity);
  const tableName = entity === "transaction" ? "[transaction]" : entity;

  const colNames = Object.keys(cols);
  const inputCols = colNames.filter(c => !(cols[c].pk && cols[c].auto));
  const requiredCols = inputCols.filter(c => cols[c].required);
  const updateCols = inputCols.filter(c => c !== "updated_at");
  const touchUpdatedAt = cols.updated_at
    ? `sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");`
    : "";

  return `
// ============================================================================
// ${Entity} CRUD
// ============================================================================

export function find${Entity}ById(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): T.${Entity} | null {
  const row = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!row) return null;
  return can("${entity}", "read", auth, row as Record<string, unknown>) ? withDerived("${entity}", row as Record<string, unknown>) as T.${Entity} : null;
}

const ${entity}Cols = new Set(${JSON.stringify(colNames)});

export function findAll${Entity}s(db: Database, opts: ListOptions = {}, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): T.${Entity}[] {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const sort = opts.sort && ${entity}Cols.has(opts.sort) ? opts.sort : "id";
  const order = opts.order === "desc" ? "DESC" : "ASC";
  const authz = authorizationScope("${entity}", "read", auth);
  if (authz.denied) return [];

  let where = "";
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (!authz.unrestricted) {
    const relationshipClauses = authz.relationshipFields
      .filter(field => ${entity}Cols.has(field))
      .map(field => \`\${field} = ?\`);
    if (!relationshipClauses.length) return [];
    clauses.push(\`(\${relationshipClauses.join(" OR ")})\`);
    for (let i = 0; i < relationshipClauses.length; i++) params.push(auth.userId);
  }
  if (opts.filter) {
    for (const [k, v] of Object.entries(opts.filter)) {
      if (${entity}Cols.has(k) && v !== undefined) {
        clauses.push(\`\${k} = ?\`);
        params.push(v);
      }
    }
  }
  if (clauses.length) where = "WHERE " + clauses.join(" AND ");

  params.push(limit, offset);
  const rows = db.query(\`SELECT * FROM ${tableName} \${where} ORDER BY \${sort} \${order} LIMIT ? OFFSET ?\`).all(...params) as T.${Entity}[];
  return rows
    .filter(row => can("${entity}", "read", auth, row as Record<string, unknown>))
    .map(row => withDerived("${entity}", row as Record<string, unknown>) as T.${Entity});
}

export function count${Entity}s(db: Database, filter?: Record<string, unknown>, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): number {
  const authz = authorizationScope("${entity}", "read", auth);
  if (authz.denied) return 0;

  let where = "";
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (!authz.unrestricted) {
    const relationshipClauses = authz.relationshipFields
      .filter(field => ${entity}Cols.has(field))
      .map(field => \`\${field} = ?\`);
    if (!relationshipClauses.length) return 0;
    clauses.push(\`(\${relationshipClauses.join(" OR ")})\`);
    for (let i = 0; i < relationshipClauses.length; i++) params.push(auth.userId);
  }
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (${entity}Cols.has(k) && v !== undefined) {
        clauses.push(\`\${k} = ?\`);
        params.push(v);
      }
    }
  }
  if (clauses.length) where = "WHERE " + clauses.join(" AND ");
  return (db.query(\`SELECT COUNT(*) as n FROM ${tableName} \${where}\`).get(...params) as { n: number }).n;
}

export function create${Entity}(db: Database, input: T.${Entity}Input, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT, auditContext: AuditContext = {}): Result<{ id: number }> {
  const inputRecord = input as Record<string, unknown>;
  for (const field of operationRelationshipFields("${entity}", "create")) {
    if (${entity}Cols.has(field) && inputRecord[field] === undefined && auth.userId !== null) {
      inputRecord[field] = auth.userId;
    }
  }
  if (!can("${entity}", "create", auth, input as Record<string, unknown>)) {
    return authorizationError("${entity}", "create", auth);
  }

  ${requiredCols.length > 0 ? `// Validate required fields
  ${requiredCols.map(c => `if (input.${c} === undefined) return { ok: false, error: "${c} is required", code: "invalid" };`).join("\n  ")}` : ""}

  // Validate formats
  const validationError = validate(input as Record<string, unknown>, "${entity}");
  if (validationError) return { ok: false, error: validationError, code: "invalid" };

  // Build dynamic insert - only include provided fields, let DB handle defaults
  const cols: string[] = [];
  const vals: unknown[] = [];
  ${inputCols.map(c => `if (input.${c} !== undefined) { cols.push("${c}"); vals.push(input.${c}); }`).join("\n  ")}

  const create = db.transaction(() => {
    const result = db.query(\`
      INSERT INTO ${tableName} (\${cols.join(", ")})
      VALUES (\${cols.map(() => "?").join(", ")})
      RETURNING id
    \`).get(...vals) as { id: number };
    writeAuditLog(db, "${entity}", "create", result.id, auth, { id: result.id }, auditContext);
    return result;
  });
  const result = create();

  return { ok: true, data: { id: result.id } };
}

export function update${Entity}(db: Database, id: number, input: Partial<T.${Entity}Input>, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT, ifMatch?: string | null, auditContext: AuditContext = {}): Result<{ id: number }> {
  const existing = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!existing) return { ok: false, error: "not found", code: "not_found" };
  if (!matchesIfMatch("${entity}", existing as Record<string, unknown>, ifMatch)) {
    return concurrencyConflict();
  }
  if (!can("${entity}", "update", auth, existing as Record<string, unknown>)) {
    return authorizationError("${entity}", "update", auth);
  }
  const inputRecord = input as Record<string, unknown>;
  for (const field of operationRelationshipFields("${entity}", "update")) {
    if (inputRecord[field] !== undefined && Number(inputRecord[field]) !== Number((existing as Record<string, unknown>)[field])) {
      return { ok: false, error: \`cannot change relationship field \${field}\`, code: "forbidden" };
    }
  }

  // Validate formats
  const validationError = validate(input as Record<string, unknown>, "${entity}", existing as Record<string, unknown>);
  if (validationError) return { ok: false, error: validationError, code: "invalid" };

  const sets: string[] = [];
  const vals: unknown[] = [];
  ${updateCols.map(c => `if (input.${c} !== undefined) { sets.push("${c} = ?"); vals.push(input.${c}); }`).join("\n  ")}
  ${touchUpdatedAt}

  if (sets.length > 0) {
    vals.push(id);
    const result = { id };
    const update = db.transaction(() => {
      db.query(\`UPDATE ${tableName} SET \${sets.join(", ")} WHERE id = ?\`).run(...vals);
      writeAuditLog(db, "${entity}", "update", id, auth, result, auditContext);
    });
    update();
  }

  return { ok: true, data: { id } };
}

export function delete${Entity}(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT, ifMatch?: string | null, auditContext: AuditContext = {}): Result<{ deleted: true }> {
  const existing = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!existing) return { ok: false, error: "not found", code: "not_found" };
  if (!matchesIfMatch("${entity}", existing as Record<string, unknown>, ifMatch)) {
    return concurrencyConflict();
  }
  if (!can("${entity}", "delete", auth, existing as Record<string, unknown>)) {
    return authorizationError("${entity}", "delete", auth);
  }

  const result = { deleted: true as const };
  const remove = db.transaction(() => {
    db.query("DELETE FROM ${tableName} WHERE id = ?").run(id);
    writeAuditLog(db, "${entity}", "delete", id, auth, result, auditContext);
  });
  remove();
  return { ok: true, data: result };
}
`;
}

function genOperationService(entity: string, opName: string, op: Operation, tables: Tables): string {
  const Entity = pascalCase(entity);
  const OpName = camelCase(opName);
  const tableName = entity === "transaction" ? "[transaction]" : entity;

  const relations = extractRelations(op.guard);
  const guardCode = op.guard ? compileExpr(op.guard, entity) : "true";
  const hasUpdatedAt = !!tables[entity]?.updated_at;

  // Generate relation loading
  const relLoads = relations.map(rel => {
    // Find FK column
    const fkCol = `${rel}_id`;
    return `  const _rel_${rel} = db.query("SELECT * FROM ${rel} WHERE id = ?").get(${entity}.${fkCol}) as T.${pascalCase(rel)} | null;
  if (!_rel_${rel}) return { ok: false, error: "${rel} not found", code: "invalid" };`;
  }).join("\n");

  // Generate set clause
  const setEntries = Object.entries(op.set);
  const setFragments = setEntries.map(([k]) => `${k} = ?`);
  if (setEntries.length > 0 && hasUpdatedAt && !setEntries.some(([k]) => k === "updated_at")) {
    setFragments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  }
  const setCode = setFragments.length > 0
    ? `db.query("UPDATE ${tableName} SET ${setFragments.join(", ")} WHERE id = ?").run(${setEntries.map(([_, v]) => JSON.stringify(v)).join(", ")}${setEntries.length > 0 ? ", " : ""}id);`
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

  const resultStatus = setEntries.find(([k]) => k === "status") ? JSON.stringify(setEntries.find(([k]) => k === "status")![1]) : '"updated"';

  return `
export function ${OpName}${Entity}(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT, ifMatch?: string | null, auditContext: AuditContext = {}): OpResult<{ id: number; status: string }> {
  const ${entity} = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!${entity}) return { ok: false, error: "not found", code: "not_found" };
  if (!matchesIfMatch("${entity}", ${entity} as Record<string, unknown>, ifMatch)) {
    return concurrencyConflict();
  }
  if (!can("${entity}", "${opName}", auth, ${entity} as Record<string, unknown>)) {
    return authorizationError("${entity}", "${opName}", auth);
  }

${relLoads}

  // Guard: ${op.guard ? "check preconditions" : "none"}
  if (!(${guardCode})) {
    return { ok: false, error: "precondition failed for ${opName}", code: "bad_state" };
  }

  // Execute in transaction
  const run = db.transaction(() => {
    ${setCode}
${cascadeCode}
    writeAuditLog(db, "${entity}", "${opName}", id, auth, { id, status: ${resultStatus} }, auditContext);
  });
  run();

  return {
    ok: true,
    data: { id, status: ${resultStatus} },
    effects: [
${effectsCode}
    ],
  };
}
`;
}

function genConfiguredCommerceServices(schema: Schema): string {
  const runtimeConfig = ecommerceRuntimeConfig(schema);
  const includeLegacyAliases = hasCommerceBookingAliases(schema);
  const legacyBookingField = includeLegacyAliases ? "booking_id: Number(order.id), " : "";
  return `
// ============================================================================
// Generic Ecommerce Workflow
// ============================================================================

const ECOMMERCE = ${JSON.stringify(runtimeConfig, null, 2)} as const;

export type CommerceOptionValue = string | number | null;

export interface CommerceCartItemInput {
  item_id: number;
  quantity?: number;
  options?: Record<string, CommerceOptionValue>;
}

export interface CommerceCheckoutInput {
  user_id?: number;
  client?: string;
  items: CommerceCartItemInput[];
}

export interface CommerceCheckoutResult {
  order_id: number;
  line_item_ids: number[];
  amount_pence: number;
  currency: string;
  expires_at: string;
  status: string;
}

export interface CommerceCatalogResult {
  items: Record<string, unknown>[];
  lookups: Record<string, Record<string, string>>;
}

export interface CommercePaymentIntentResult {
  order_id: number;
  transaction_id: number;
  reference: string;
  amount_pence: number;
  currency: string;
  client_secret: string;
  provider: string;
}

${includeLegacyAliases ? `
export interface ReserveTicketRequest {
  ticket_type?: string;
  seat?: string;
}

export interface ReserveBookingInput {
  performance_id: number;
  user_id?: number;
  quantity?: number;
  ticket_type?: string;
  client?: string;
  tickets?: ReserveTicketRequest[];
}

export interface ReserveBookingResult {
  booking_id: number;
  ticket_ids: number[];
  amount_pence: number;
  currency: string;
  expires_at: string;
  status: string;
}

export interface PaymentIntentResult {
  booking_id: number;
  transaction_id: number;
  reference: string;
  amount_pence: number;
  currency: string;
  client_secret: string;
  provider: string;
}
` : ""}

export interface PaymentWebhookInput {
  reference: string;
  status: "succeeded" | "failed";
  provider?: string;
}

export interface PaymentWebhookResult {
${includeLegacyAliases ? "  booking_id: number;\n" : ""}  order_id: number;
  transaction_id: number;
  status: string;
  idempotent: boolean;
}

interface ProviderPaymentIntent {
  provider: string;
  reference: string;
  client_secret: string;
}

function paymentProvider(): string {
  return (process.env.PAYMENT_PROVIDER || "local").trim().toLowerCase();
}

function stripeApiBase(): string {
  return (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\\/+$/, "");
}

function stripeApiKey(): string {
  return process.env.STRIPE_SECRET_KEY || process.env.PAYMENT_API_KEY || "";
}

function stripeError(status: number, message: string): Result<ProviderPaymentIntent> {
  return {
    ok: false,
    error: "Stripe payment intent request failed with status " + status,
    code: "internal_error",
    details: { provider: "stripe", status: String(status), message },
  };
}

function parseStripeJson(body: string): Record<string, unknown> {
  try {
    return body ? JSON.parse(body) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function localPaymentIntent(reference?: string, provider = "local"): Result<ProviderPaymentIntent> {
  const id = reference || ("fake_pi_" + crypto.randomUUID());
  return { ok: true, data: { provider, reference: id, client_secret: id + "_secret" } };
}

async function createStripePaymentIntent(orderId: number, amount: number, currency: string): Promise<Result<ProviderPaymentIntent>> {
  const key = stripeApiKey();
  if (!key) return { ok: false, error: "PAYMENT_API_KEY is required for Stripe payment intents", code: "internal_error" };

  const body = new URLSearchParams();
  body.set("amount", String(amount));
  body.set("currency", currency.toLowerCase());
  body.set("automatic_payment_methods[enabled]", "true");
  body.set("metadata[openb2c_order_id]", String(orderId));

  const res = await fetch(stripeApiBase() + "/v1/payment_intents", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + key,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": "openb2c-commerce-order-" + orderId,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) return stripeError(res.status, text);

  const payload = parseStripeJson(text);
  if (typeof payload.id !== "string" || typeof payload.client_secret !== "string") {
    return { ok: false, error: "Stripe payment intent response was missing id or client_secret", code: "internal_error" };
  }
  return { ok: true, data: { provider: "stripe", reference: payload.id, client_secret: payload.client_secret } };
}

async function retrieveStripePaymentIntent(reference: string): Promise<Result<ProviderPaymentIntent>> {
  const key = stripeApiKey();
  if (!key) return { ok: false, error: "PAYMENT_API_KEY is required for Stripe payment intents", code: "internal_error" };

  const res = await fetch(stripeApiBase() + "/v1/payment_intents/" + encodeURIComponent(reference), {
    headers: { "authorization": "Bearer " + key },
  });
  const text = await res.text();
  if (!res.ok) return stripeError(res.status, text);

  const payload = parseStripeJson(text);
  if (typeof payload.id !== "string" || typeof payload.client_secret !== "string") {
    return { ok: false, error: "Stripe payment intent response was missing id or client_secret", code: "internal_error" };
  }
  return { ok: true, data: { provider: "stripe", reference: payload.id, client_secret: payload.client_secret } };
}

async function createProviderPaymentIntent(orderId: number, amount: number, currency: string): Promise<Result<ProviderPaymentIntent>> {
  const provider = paymentProvider();
  if (provider === "local") return localPaymentIntent();
  if (provider === "fake") return localPaymentIntent(undefined, "fake");
  if (provider === "stripe") return createStripePaymentIntent(orderId, amount, currency);
  return { ok: false, error: "unsupported PAYMENT_PROVIDER " + provider, code: "internal_error" };
}

async function retrieveProviderPaymentIntent(reference: string): Promise<Result<ProviderPaymentIntent>> {
  const provider = paymentProvider();
  if (provider === "local") return localPaymentIntent(reference);
  if (provider === "fake") return localPaymentIntent(reference, "fake");
  if (provider === "stripe") return retrieveStripePaymentIntent(reference);
  return { ok: false, error: "unsupported PAYMENT_PROVIDER " + provider, code: "internal_error" };
}

function column(ref: { field: string }): string {
  return "[" + ref.field.replace(/]/g, "]]") + "]";
}

function table(name: string): string {
  return "[" + name.replace(/]/g, "]]") + "]";
}

function referencedEntityName(ref: { references?: string | null }): string | null {
  const match = ref.references?.match(/^([a-z_]+)\\(/);
  return match?.[1] ?? null;
}

function labelRecord(row: Record<string, unknown>): string {
  return String(row.title || row.name || row.email || row.reference || ("#" + row.id));
}

function resolveCommerceUser(inputUserId: number | undefined, auth: T.AuthContext): Result<number> {
  if (auth.userId !== null) return { ok: true, data: auth.userId };
  if (inputUserId !== undefined && hasScope(auth, "*")) return { ok: true, data: inputUserId };
  return { ok: false, error: "authenticated user required", code: "unauthorized" };
}

function optionDefinitions(): Record<string, {
  field: { field: string } | null;
  type: string;
  label: string | null;
  default: string | null;
  choices: string[];
  required: boolean;
  min: number | null;
  max: number | null;
}> {
  return ECOMMERCE.lineItem.options as any;
}

function normalizeCommerceOptions(input: Record<string, CommerceOptionValue> | undefined): Result<Record<string, CommerceOptionValue>> {
  const out: Record<string, CommerceOptionValue> = {};
  for (const [name, def] of Object.entries(optionDefinitions())) {
    const raw = input?.[name] ?? def.default ?? null;
    if ((raw === null || raw === "") && def.required) {
      return { ok: false, error: name + " is required", code: "invalid" };
    }
    if (raw !== null && raw !== "") {
      if (def.choices.length > 0 && !def.choices.includes(String(raw))) {
        return { ok: false, error: name + " is not an allowed option", code: "invalid" };
      }
      if (def.type === "integer") {
        const n = Number(raw);
        if (!Number.isInteger(n)) return { ok: false, error: name + " must be an integer", code: "invalid" };
        if (def.min !== null && n < def.min) return { ok: false, error: name + " is below minimum", code: "invalid" };
        if (def.max !== null && n > def.max) return { ok: false, error: name + " is above maximum", code: "invalid" };
        out[name] = n;
      } else {
        out[name] = String(raw);
      }
    } else {
      out[name] = null;
    }
  }
  return { ok: true, data: out };
}

function commerceLineItemIdsForOrder(db: Database, orderId: number): number[] {
  return (db.query(
    "SELECT " + column(ECOMMERCE.orderLine.lineItem) + " AS line_item_id FROM " + ECOMMERCE.orderLine.table +
    " WHERE " + column(ECOMMERCE.orderLine.order) + " = ? ORDER BY id"
  ).all(orderId) as { line_item_id: number }[]).map(row => row.line_item_id);
}

export function listCommerceCatalog(db: Database): Result<CommerceCatalogResult> {
  const params: unknown[] = [];
  const where = ECOMMERCE.catalog.availability.field
    ? " WHERE " + column(ECOMMERCE.catalog.availability.field) + " = ?"
    : "";
  if (ECOMMERCE.catalog.availability.field) params.push(ECOMMERCE.catalog.availability.available);

  const items = db.query(
    "SELECT * FROM " + ECOMMERCE.catalog.table + where + " ORDER BY [id]"
  ).all(...params) as Record<string, unknown>[];

  const lookups: Record<string, Record<string, string>> = {};
  for (const ref of ECOMMERCE.catalog.variantFields) {
    const entity = referencedEntityName(ref);
    if (!entity) continue;
    const ids = [...new Set(items.map(item => item[ref.field]).filter(value => value !== null && value !== undefined).map(String))];
    if (ids.length === 0) {
      lookups[ref.field] = {};
      continue;
    }
    const rows = db.query(
      "SELECT * FROM " + table(entity) + " WHERE [id] IN (" + ids.map(() => "?").join(", ") + ")"
    ).all(...ids) as Record<string, unknown>[];
    lookups[ref.field] = Object.fromEntries(rows.map(row => [String(row.id), labelRecord(row)]));
  }

  return { ok: true, data: { items, lookups } };
}

function expireCommerceOrderIds(db: Database, orderIds: number[]): number {
  if (orderIds.length === 0) return 0;
  const placeholders = orderIds.map(() => "?").join(", ");
  const orderPaymentRef = column(ECOMMERCE.order.paymentReference);
  const orderId = "[id]";
  const expire = db.transaction(() => {
    db.query(
      "UPDATE " + ECOMMERCE.transaction.table + " SET " + column(ECOMMERCE.transaction.status) + " = ? " +
      "WHERE " + column(ECOMMERCE.transaction.status) + " = ? AND " + column(ECOMMERCE.transaction.reference) +
      " IN (SELECT " + orderPaymentRef + " FROM " + ECOMMERCE.order.table + " WHERE " + orderId + " IN (" + placeholders + ") AND " + orderPaymentRef + " IS NOT NULL)"
    ).run(ECOMMERCE.transaction.failedStatus, ECOMMERCE.transaction.pendingStatus, ...orderIds);
    db.query(
      "UPDATE " + ECOMMERCE.lineItem.table + " SET " + column(ECOMMERCE.lineItem.status) + " = ? WHERE [id] IN (" +
      "SELECT " + column(ECOMMERCE.orderLine.lineItem) + " FROM " + ECOMMERCE.orderLine.table +
      " WHERE " + column(ECOMMERCE.orderLine.order) + " IN (" + placeholders + "))"
    ).run(ECOMMERCE.lineItem.cancelledStatus, ...orderIds);
    db.query(
      "UPDATE " + ECOMMERCE.order.table + " SET " + column(ECOMMERCE.order.status) + " = ? " +
      "WHERE " + column(ECOMMERCE.order.status) + " = ? AND [id] IN (" + placeholders + ")"
    ).run(ECOMMERCE.order.expiredStatus, ECOMMERCE.order.pendingStatus, ...orderIds);
  });
  expire();
  return orderIds.length;
}

export function checkoutCommerceCart(db: Database, input: CommerceCheckoutInput, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): OpResult<CommerceCheckoutResult> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) return { ok: false, error: "cart must contain at least one item", code: "invalid" };
  if (items.length > ECOMMERCE.checkout.maxLines) return { ok: false, error: "cart has too many lines", code: "invalid" };

  const user = resolveCommerceUser(input.user_id, auth);
  if (!user.ok) return { ok: false, error: user.error, code: user.code };
  const userId = user.data;
  if (!can(ECOMMERCE.order.entity, "create", auth, { [ECOMMERCE.order.user.field]: userId })) {
    return authorizationError(ECOMMERCE.order.entity, "create", auth);
  }

  if (ECOMMERCE.order.userTable) {
    const userRow = db.query("SELECT id FROM " + ECOMMERCE.order.userTable + " WHERE id = ?").get(userId) as { id: number } | null;
    if (!userRow) return { ok: false, error: "user not found", code: "not_found" };
  }

  const preparedItems: {
    itemId: number;
    quantity: number;
    unitPrice: number;
    options: Record<string, CommerceOptionValue>;
  }[] = [];

  for (const item of items) {
    if (!Number.isInteger(item.item_id) || item.item_id <= 0) {
      return { ok: false, error: "item_id is required", code: "invalid" };
    }
    const quantity = item.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > ECOMMERCE.checkout.maxQuantity) {
      return { ok: false, error: "quantity must be between 1 and " + ECOMMERCE.checkout.maxQuantity, code: "invalid" };
    }

    const catalog = db.query(
      "SELECT [id] AS id, " + column(ECOMMERCE.catalog.price) + " AS price" +
      (ECOMMERCE.catalog.availability.field ? ", " + column(ECOMMERCE.catalog.availability.field) + " AS availability" : "") +
      " FROM " + ECOMMERCE.catalog.table + " WHERE [id] = ?"
    ).get(item.item_id) as { id: number; price: number; availability?: string | number | null } | null;
    if (!catalog) return { ok: false, error: "catalog item not found", code: "not_found" };
    if (ECOMMERCE.catalog.availability.field && String(catalog.availability) !== ECOMMERCE.catalog.availability.available) {
      return { ok: false, error: "catalog item is not available", code: "bad_state" };
    }
    if (!Number.isInteger(catalog.price) || catalog.price <= 0) {
      return { ok: false, error: "catalog item has no configured price", code: "invalid" };
    }

    const options = normalizeCommerceOptions(item.options);
    if (!options.ok) return options;
    preparedItems.push({ itemId: item.item_id, quantity, unitPrice: catalog.price, options: options.data });
  }

  const amount = preparedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const expiresAt = new Date(Date.now() + ECOMMERCE.checkout.expiryMinutes * 60000).toISOString();
  const client = typeof input.client === "string" && input.client.trim() ? input.client : "web";

  try {
    const create = db.transaction(() => {
      const orderColumns = [
        column(ECOMMERCE.order.user),
        column(ECOMMERCE.order.status),
        column(ECOMMERCE.order.amount),
        column(ECOMMERCE.order.currency),
        column(ECOMMERCE.order.expiresAt),
        ...(ECOMMERCE.order.client ? [column(ECOMMERCE.order.client)] : []),
      ];
      const orderValues = [
        userId,
        ECOMMERCE.order.pendingStatus,
        amount,
        ECOMMERCE.checkout.currency,
        expiresAt,
        ...(ECOMMERCE.order.client ? [client] : []),
      ];
      const order = db.query(
        "INSERT INTO " + ECOMMERCE.order.table + " (" + orderColumns.join(", ") + ") VALUES (" +
        orderColumns.map(() => "?").join(", ") + ") RETURNING id"
      ).get(...orderValues) as { id: number };

      const lineItemIds: number[] = [];
      for (const item of preparedItems) {
        const repetitions = ECOMMERCE.lineItem.quantity ? 1 : item.quantity;
        for (let i = 0; i < repetitions; i++) {
          const lineColumns = [
            column(ECOMMERCE.lineItem.catalogItem),
            column(ECOMMERCE.lineItem.price),
            column(ECOMMERCE.lineItem.status),
            ...(ECOMMERCE.lineItem.user ? [column(ECOMMERCE.lineItem.user)] : []),
            ...(ECOMMERCE.lineItem.quantity ? [column(ECOMMERCE.lineItem.quantity)] : []),
          ];
          const lineValues: unknown[] = [
            item.itemId,
            item.unitPrice,
            ECOMMERCE.lineItem.reservedStatus,
            ...(ECOMMERCE.lineItem.user ? [userId] : []),
            ...(ECOMMERCE.lineItem.quantity ? [item.quantity] : []),
          ];
          for (const [name, def] of Object.entries(optionDefinitions())) {
            if (!def.field) continue;
            lineColumns.push(column(def.field));
            lineValues.push(item.options[name] ?? null);
          }

          const line = db.query(
            "INSERT INTO " + ECOMMERCE.lineItem.table + " (" + lineColumns.join(", ") + ") VALUES (" +
            lineColumns.map(() => "?").join(", ") + ") RETURNING id"
          ).get(...lineValues) as { id: number };
          lineItemIds.push(line.id);
          db.query(
            "INSERT INTO " + ECOMMERCE.orderLine.table + " (" + column(ECOMMERCE.orderLine.order) + ", " + column(ECOMMERCE.orderLine.lineItem) + ") VALUES (?, ?)"
          ).run(order.id, line.id);
        }
      }
      return { orderId: order.id, lineItemIds };
    });

    const result = create();
    return {
      ok: true,
      data: {
        order_id: result.orderId,
        line_item_ids: result.lineItemIds,
        amount_pence: amount,
        currency: ECOMMERCE.checkout.currency,
        expires_at: expiresAt,
        status: ECOMMERCE.order.pendingStatus,
      },
      effects: [
        { type: "emit", payload: { event: "commerce.order_created", order_id: result.orderId, line_item_ids: result.lineItemIds, amount_pence: amount } },
      ],
    };
  } catch {
    return { ok: false, error: "checkout failed", code: "conflict" };
  }
}

export async function createCommercePaymentIntent(db: Database, orderId: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): Promise<OpResult<CommercePaymentIntentResult>> {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: "order id is required", code: "invalid" };
  }

  const order = db.query("SELECT * FROM " + ECOMMERCE.order.table + " WHERE id = ?").get(orderId) as Record<string, unknown> | null;
  if (!order) return { ok: false, error: "order not found", code: "not_found" };
  if (!can(ECOMMERCE.order.entity, "update", auth, order)) {
    return authorizationError(ECOMMERCE.order.entity, "update", auth);
  }
  if (order[ECOMMERCE.order.status.field] !== ECOMMERCE.order.pendingStatus) {
    return { ok: false, error: "order is not awaiting payment", code: "bad_state" };
  }
  if (Date.parse(String(order[ECOMMERCE.order.expiresAt.field])) <= Date.now()) {
    expireCommerceOrderIds(db, [Number(order.id)]);
    return { ok: false, error: "order expired", code: "bad_state" };
  }

  const existingReference = order[ECOMMERCE.order.paymentReference.field];
  if (existingReference) {
    const existing = db.query("SELECT id FROM " + ECOMMERCE.transaction.table + " WHERE " + column(ECOMMERCE.transaction.reference) + " = ?")
      .get(existingReference) as { id: number } | null;
    if (existing) {
      const providerIntent = await retrieveProviderPaymentIntent(String(existingReference));
      if (!providerIntent.ok) return providerIntent;
      return {
        ok: true,
        data: {
          order_id: Number(order.id),
          transaction_id: existing.id,
          reference: providerIntent.data.reference,
          amount_pence: Number(order[ECOMMERCE.order.amount.field]),
          currency: String(order[ECOMMERCE.order.currency.field]),
          client_secret: providerIntent.data.client_secret,
          provider: providerIntent.data.provider,
        },
      };
    }
  }

  const lineItemIds = commerceLineItemIdsForOrder(db, Number(order.id));
  if (lineItemIds.length === 0) return { ok: false, error: "order has no line items", code: "invalid" };
  const amount = Number(order[ECOMMERCE.order.amount.field]);
  const currency = String(order[ECOMMERCE.order.currency.field]);
  const providerIntent = await createProviderPaymentIntent(Number(order.id), amount, currency);
  if (!providerIntent.ok) return providerIntent;
  const reference = providerIntent.data.reference;
  const client = ECOMMERCE.order.client ? String(order[ECOMMERCE.order.client.field] ?? "web") : "web";

  const create = db.transaction(() => {
    const txColumns = [
      column(ECOMMERCE.transaction.user),
      column(ECOMMERCE.transaction.amount),
      column(ECOMMERCE.transaction.status),
      column(ECOMMERCE.transaction.reference),
      ...(ECOMMERCE.transaction.type ? [column(ECOMMERCE.transaction.type)] : []),
      ...(ECOMMERCE.transaction.client ? [column(ECOMMERCE.transaction.client)] : []),
    ];
    const txValues = [
      Number(order[ECOMMERCE.order.user.field]),
      amount,
      ECOMMERCE.transaction.pendingStatus,
      reference,
      ...(ECOMMERCE.transaction.type ? [ECOMMERCE.transaction.purchaseType] : []),
      ...(ECOMMERCE.transaction.client ? [client] : []),
    ];
    const transaction = db.query(
      "INSERT INTO " + ECOMMERCE.transaction.table + " (" + txColumns.join(", ") + ") VALUES (" +
      txColumns.map(() => "?").join(", ") + ") RETURNING id"
    ).get(...txValues) as { id: number };
    for (const lineItemId of lineItemIds) {
      db.query(
        "INSERT OR IGNORE INTO " + ECOMMERCE.transactionLine.table + " (" + column(ECOMMERCE.transactionLine.transaction) + ", " + column(ECOMMERCE.transactionLine.lineItem) + ") VALUES (?, ?)"
      ).run(transaction.id, lineItemId);
    }
    db.query(
      "UPDATE " + ECOMMERCE.order.table + " SET " + column(ECOMMERCE.order.paymentReference) + " = ? WHERE id = ?"
    ).run(reference, order.id);
    return transaction.id;
  });
  const transactionId = create();

  return {
    ok: true,
    data: {
      order_id: Number(order.id),
      transaction_id: transactionId,
      reference,
      amount_pence: amount,
      currency,
      client_secret: providerIntent.data.client_secret,
      provider: providerIntent.data.provider,
    },
    effects: [
      {
        type: "call",
        payload: {
          service: "payment",
          action: "create_intent",
          provider: providerIntent.data.provider,
          reference,
          amount_pence: amount,
          currency,
          order_id: Number(order.id),
          transaction_id: transactionId,
        },
      },
    ],
  };
}

export function handleCommercePaymentWebhook(db: Database, input: PaymentWebhookInput): OpResult<PaymentWebhookResult> {
  if (!input.reference || typeof input.reference !== "string") {
    return { ok: false, error: "reference is required", code: "invalid" };
  }
  if (input.status !== "succeeded" && input.status !== "failed") {
    return { ok: false, error: "unsupported payment status", code: "invalid" };
  }

  const transaction = db.query("SELECT * FROM " + ECOMMERCE.transaction.table + " WHERE " + column(ECOMMERCE.transaction.reference) + " = ?")
    .get(input.reference) as Record<string, unknown> | null;
  if (!transaction) return { ok: false, error: "transaction not found", code: "not_found" };
  const order = db.query("SELECT * FROM " + ECOMMERCE.order.table + " WHERE " + column(ECOMMERCE.order.paymentReference) + " = ?")
    .get(input.reference) as Record<string, unknown> | null;
  if (!order) return { ok: false, error: "order not found", code: "not_found" };

  if (input.status === "succeeded") {
    if (transaction[ECOMMERCE.transaction.status.field] === ECOMMERCE.transaction.completedStatus && order[ECOMMERCE.order.status.field] === ECOMMERCE.order.paidStatus) {
      return { ok: true, data: { ${legacyBookingField}order_id: Number(order.id), transaction_id: Number(transaction.id), status: ECOMMERCE.order.paidStatus, idempotent: true } };
    }
    if (order[ECOMMERCE.order.status.field] !== ECOMMERCE.order.pendingStatus) {
      return { ok: false, error: "order is not awaiting payment", code: "bad_state" };
    }
    const complete = db.transaction(() => {
      db.query("UPDATE " + ECOMMERCE.transaction.table + " SET " + column(ECOMMERCE.transaction.status) + " = ? WHERE id = ?")
        .run(ECOMMERCE.transaction.completedStatus, transaction.id);
      db.query("UPDATE " + ECOMMERCE.order.table + " SET " + column(ECOMMERCE.order.status) + " = ? WHERE id = ?")
        .run(ECOMMERCE.order.paidStatus, order.id);
      db.query(
        "UPDATE " + ECOMMERCE.lineItem.table + " SET " + column(ECOMMERCE.lineItem.status) + " = ? WHERE [id] IN (" +
        "SELECT " + column(ECOMMERCE.orderLine.lineItem) + " FROM " + ECOMMERCE.orderLine.table + " WHERE " + column(ECOMMERCE.orderLine.order) + " = ?)"
      ).run(ECOMMERCE.lineItem.fulfilledStatus, order.id);
    });
    complete();
    return {
      ok: true,
      data: { ${legacyBookingField}order_id: Number(order.id), transaction_id: Number(transaction.id), status: ECOMMERCE.order.paidStatus, idempotent: false },
      effects: [
        { type: "emit", payload: { event: "commerce.order_paid", order_id: Number(order.id), transaction_id: Number(transaction.id), reference: input.reference } },
        { type: "notify", payload: { channel: "email", template: "receipt", to: "customer", order_id: Number(order.id), transaction_id: Number(transaction.id) } },
        { type: "call", payload: { service: "analytics", action: "track_purchase", order_id: Number(order.id), transaction_id: Number(transaction.id), amount_pence: Number(order[ECOMMERCE.order.amount.field]) } },
      ],
    };
  }

  if (transaction[ECOMMERCE.transaction.status.field] === ECOMMERCE.transaction.failedStatus && order[ECOMMERCE.order.status.field] === ECOMMERCE.order.cancelledStatus) {
    return { ok: true, data: { ${legacyBookingField}order_id: Number(order.id), transaction_id: Number(transaction.id), status: ECOMMERCE.order.cancelledStatus, idempotent: true } };
  }
  const fail = db.transaction(() => {
    db.query("UPDATE " + ECOMMERCE.transaction.table + " SET " + column(ECOMMERCE.transaction.status) + " = ? WHERE id = ?")
      .run(ECOMMERCE.transaction.failedStatus, transaction.id);
    db.query("UPDATE " + ECOMMERCE.order.table + " SET " + column(ECOMMERCE.order.status) + " = ? WHERE id = ?")
      .run(ECOMMERCE.order.cancelledStatus, order.id);
    db.query(
      "UPDATE " + ECOMMERCE.lineItem.table + " SET " + column(ECOMMERCE.lineItem.status) + " = ? WHERE [id] IN (" +
      "SELECT " + column(ECOMMERCE.orderLine.lineItem) + " FROM " + ECOMMERCE.orderLine.table + " WHERE " + column(ECOMMERCE.orderLine.order) + " = ?)"
    ).run(ECOMMERCE.lineItem.cancelledStatus, order.id);
  });
  fail();
  return {
    ok: true,
    data: { ${legacyBookingField}order_id: Number(order.id), transaction_id: Number(transaction.id), status: ECOMMERCE.order.cancelledStatus, idempotent: false },
    effects: [
      { type: "emit", payload: { event: "commerce.payment_failed", order_id: Number(order.id), transaction_id: Number(transaction.id), reference: input.reference } },
    ],
  };
}

export function expireCommerceOrders(db: Database, now: Date = new Date()): Result<{ expired: number }> {
  const rows = db.query(
    "SELECT id FROM " + ECOMMERCE.order.table + " WHERE " + column(ECOMMERCE.order.status) + " = ? AND " + column(ECOMMERCE.order.expiresAt) + " < ?"
  ).all(ECOMMERCE.order.pendingStatus, now.toISOString()) as { id: number }[];
  return { ok: true, data: { expired: expireCommerceOrderIds(db, rows.map(row => row.id)) } };
}

${includeLegacyAliases ? `
export function reserveBooking(db: Database, input: ReserveBookingInput, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): OpResult<ReserveBookingResult> {
  if (!Number.isInteger(input.performance_id) || input.performance_id <= 0) {
    return { ok: false, error: "performance_id is required", code: "invalid" };
  }
  const items = Array.isArray(input.tickets) && input.tickets.length > 0
    ? input.tickets.map(ticket => ({
        item_id: input.performance_id,
        quantity: 1,
        options: {
          ticket_type: ticket.ticket_type ?? input.ticket_type ?? "standard",
          seat: ticket.seat ?? null,
        },
      }))
    : [{
        item_id: input.performance_id,
        quantity: input.quantity ?? 1,
        options: { ticket_type: input.ticket_type ?? "standard" },
      }];
  const result = checkoutCommerceCart(db, { user_id: input.user_id, client: input.client, items }, auth);
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      booking_id: result.data.order_id,
      ticket_ids: result.data.line_item_ids,
      amount_pence: result.data.amount_pence,
      currency: result.data.currency,
      expires_at: result.data.expires_at,
      status: result.data.status,
    },
    effects: [
      ...(result.effects || []),
      { type: "emit", payload: { event: "booking.reserved", booking_id: result.data.order_id, ticket_ids: result.data.line_item_ids, amount_pence: result.data.amount_pence } },
    ],
  };
}

export async function createPaymentIntentForBooking(db: Database, bookingId: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): Promise<OpResult<PaymentIntentResult>> {
  const result = await createCommercePaymentIntent(db, bookingId, auth);
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      booking_id: result.data.order_id,
      transaction_id: result.data.transaction_id,
      reference: result.data.reference,
      amount_pence: result.data.amount_pence,
      currency: result.data.currency,
      client_secret: result.data.client_secret,
      provider: result.data.provider,
    },
    effects: result.effects,
  };
}

export function handlePaymentWebhook(db: Database, input: PaymentWebhookInput): OpResult<PaymentWebhookResult> {
  return handleCommercePaymentWebhook(db, input);
}

export function expireCheckoutBookings(db: Database, now: Date = new Date()): Result<{ expired: number }> {
  return expireCommerceOrders(db, now);
}
` : ""}
`;
}

export function genServices(schema: Schema): string {
  const chunks: string[] = [
    "// Generated by schema/codegen.ts — do not edit\n",
    genServiceImports(schema),
  ];

  // Generate CRUD for each entity
  for (const [entity, cols] of Object.entries(schema.tables)) {
    chunks.push(genCrudService(entity, cols));
  }

  // Generate operations
  for (const [entity, ops] of Object.entries(schema.operations)) {
    for (const [opName, op] of Object.entries(ops)) {
      if (CRUD_ACTIONS.has(opName)) continue;
      chunks.push(genOperationService(entity, opName, op, schema.tables));
    }
  }

  if (hasCommerceWorkflow(schema)) {
    chunks.push(genConfiguredCommerceServices(schema));
  }

  return chunks.join("\n");
}
