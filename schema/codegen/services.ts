import type { Column, Operation, Schema, Tables } from "./types";
import { pascalCase, camelCase } from "./utils";
import { compileExpr, extractRelations } from "./expr";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);

function defaultOperation(): Operation {
  return { guard: null, relationships: [], public: false, scope: null, set: {}, cascade: [], effects: [] };
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

function genServiceImports(schema: Schema): string {
  const policy = JSON.stringify(operationPolicies(schema), null, 2);
  const selfScopes = JSON.stringify(selfServiceScopes(schema), null, 2);
  return `import { Database } from "bun:sqlite";
import * as T from "./types";

export type ErrorCode = "not_found" | "invalid" | "bad_state" | "conflict" | "unauthorized" | "forbidden" | "rate_limited";

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

export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "do_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashApiKey(key: string): Promise<string> {
  return Bun.password.hash(key, { algorithm: "bcrypt", cost: 10 });
}

export const SELF_SERVICE_SCOPES = ${selfScopes} as const;

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
    case "not_found": return 404;
    case "conflict": return 409;
    case "bad_state": return 409;
    case "invalid":
    default:
      return 400;
  }
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

export async function issueCertificate(email: string, publicKey: string): Promise<T.Certificate> {
  if (!registryPrivateKey) throw new Error("Registry keys not initialized");

  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

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

  return `
// ============================================================================
// ${Entity} CRUD
// ============================================================================

export function find${Entity}ById(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): T.${Entity} | null {
  const row = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!row) return null;
  return can("${entity}", "read", auth, row as Record<string, unknown>) ? row : null;
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
  return rows.filter(row => can("${entity}", "read", auth, row as Record<string, unknown>));
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

export function create${Entity}(db: Database, input: T.${Entity}Input, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): Result<{ id: number }> {
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

export function update${Entity}(db: Database, id: number, input: Partial<T.${Entity}Input>, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): Result<{ id: number }> {
  const existing = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!existing) return { ok: false, error: "not found", code: "not_found" };
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

export function delete${Entity}(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): Result<{ deleted: true }> {
  const existing = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!existing) return { ok: false, error: "not found", code: "not_found" };
  if (!can("${entity}", "delete", auth, existing as Record<string, unknown>)) {
    return authorizationError("${entity}", "delete", auth);
  }

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
export function ${OpName}${Entity}(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT): OpResult<{ id: number; status: string }> {
  const ${entity} = db.query("SELECT * FROM ${tableName} WHERE id = ?").get(id) as T.${Entity} | null;
  if (!${entity}) return { ok: false, error: "not found", code: "not_found" };
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

  return chunks.join("\n");
}
