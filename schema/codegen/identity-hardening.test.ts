import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { envVarSpecs, genEnvExample, requiredProductionEnvVars } from "./config";
import { genEffectsInterface } from "./effects";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genOpenAPI } from "./openapi";
import { genRuntime } from "./runtime";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {
    user: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      email: { type: "text", pk: false, auto: false, required: true, unique: true, default: null, references: null },
      name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
    },
    identity_challenge: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      email: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      code_hash: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      public_key: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      ip_address: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
      created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
      expires_at: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      used: { type: "integer", pk: false, auto: false, required: false, unique: false, default: "0", references: null },
    },
    identity_registry: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      email: { type: "text", pk: false, auto: false, required: true, unique: true, default: null, references: null },
      public_key: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      verified_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
      revoked: { type: "integer", pk: false, auto: false, required: false, unique: false, default: "0", references: null },
    },
    identity_verification_attempt: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      challenge_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      email: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
    },
    identity_request_signature: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      signature: { type: "text", pk: false, auto: false, required: true, unique: true, default: null, references: null },
      created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
    },
    identity_session: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      user_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "user(id)" },
      token_hash: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      token_prefix: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
      last_used_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
      expires_at: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      revoked: { type: "integer", pk: false, auto: false, required: false, unique: false, default: "0", references: null },
    },
  },
  operations: {},
};

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-identity-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "runtime.ts"), genRuntime(schema));
  writeFileSync(join(dir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

function createDb(): Database {
  const db = new Database(":memory:");
  for (const stmt of genSQL(schema.tables).split(/;\s*\n/).filter(s => s.trim())) {
    db.run(stmt);
  }
  return db;
}

async function signText(privateKey: CryptoKey, text: string): Promise<string> {
  return bytesToHex(await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(text)
  ));
}

async function signRequest(privateKey: CryptoKey, method: string, path: string, timestamp: string): Promise<string> {
  return signText(privateKey, `${method} ${path} ${timestamp}`);
}

function clearServerEnv() {
  delete process.env.DB_PATH;
  delete process.env.PORT;
  delete process.env.AUTH_ENABLED;
  delete process.env.ALLOW_INSECURE_AUTH_DISABLED;
  delete process.env.CORS_ORIGINS;
  delete process.env.REGISTRY_PUBLIC_KEY;
  delete process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS;
  delete process.env.ALLOW_FAKE_PROVIDERS;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_EMAILS_URL;
  delete process.env.EMAIL_FROM;
  delete process.env.IDENTITY_OTP_SUBJECT;
  delete process.env.NODE_ENV;
}

async function issueThroughChallenge(
  services: any,
  db: Database,
  email: string,
  keyPair: CryptoKeyPair,
  ipAddress: string
): Promise<{ cert: any; publicKey: string }> {
  const publicKey = bytesToHex(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const challenge = await services.createChallenge(db, email, publicKey, ipAddress);
  expect(challenge.ok).toBe(true);
  const signature = await signText(keyPair.privateKey, challenge.data.code);
  const result = await services.verifyChallenge(db, challenge.data.challengeId, challenge.data.code, signature);
  expect(result.ok).toBe(true);
  return { cert: result.data, publicKey };
}

describe("identity hardening generation", () => {
  test("registry keys are initialized before the server starts", () => {
    const server = genRoutes(schema);
    const runtime = genRuntime(schema);

    expect(runtime).toContain("export async function initRegistryPublicKey(): Promise<string>");
    expect(server).toContain("const registryPubKey = await initRegistryPublicKey();");
    expect(server.indexOf("const registryPubKey = await initRegistryPublicKey();")).toBeLessThan(
      server.indexOf("const server = Bun.serve({")
    );
    expect(runtime).toContain("export const USE_EXTERNAL_REGISTRY = !REGISTRY_PRIVATE_KEY && !!REGISTRY_PUBLIC_KEY;");
    expect(runtime).toContain("export const REQUIRE_LOCAL_CERTIFICATE_REGISTRY = !USE_EXTERNAL_REGISTRY;");
    expect(server).toContain("bootstrapRuntime()");
    expect(server).toContain("S.verifyRequest(db, cert, registryPubKey, REQUIRE_LOCAL_CERTIFICATE_REGISTRY");
    expect(server).toContain("S.createChallenge(db, email, publicKey, clientIp(req))");
    expect(server).toContain("S.issueIdentitySession(db, userId)");
    expect(server).toContain("sendIdentityChallengeEmail(email, result.data.code, result.data.challengeId)");
    expect(server).toContain("await S.verifyIdentitySession(db, key)");
    expect(server).toContain("const SUPPORTS_API_KEYS = false;");
    expect(server).toContain("SUPPORTS_API_KEYS ? await S.verifyApiKey(db, key) : null");
    expect(server).toContain('path: "/auth/revoke-current"');
    expect(server).toContain("S.revokeCertificate(db, cert)");
    expect(server).toContain("S.revokeIdentitySessionToken(db, authHeader.slice(7))");
    expect(server).not.toContain("(async () => {");

    const openapi = JSON.parse(genOpenAPI(schema));
    expect(openapi.paths["/auth/revoke-current"]).toBeDefined();
    expect(openapi.paths["/auth/revoke-current"].post.security).toEqual([
      { bearerAuth: [] },
      { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
    ]);
    expect(openapi.paths["/identity/public-key"].get.security).toBeUndefined();
    expect(openapi.paths["/identity/challenge"].post.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/IdentityChallengeInput",
    });
    expect(openapi.paths["/identity/verify"].post.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/IdentityVerifyResult",
    });
    expect(openapi.components.schemas.IdentityVerifyResult.required).toEqual(["certificate", "sessionToken", "sessionExpiresAt", "auth"]);
  });

  test("identity production configuration requires Resend OTP delivery", () => {
    const required = requiredProductionEnvVars(schema);
    expect(required).toContain("RESEND_API_KEY");
    expect(required).toContain("EMAIL_FROM");
    expect(required).not.toContain("EMAIL_WEBHOOK_URL");

    const specs = envVarSpecs(schema);
    expect(specs.find(spec => spec.name === "EMAIL_PROVIDER")?.example).toBe("resend");
    expect(specs.find(spec => spec.name === "RESEND_API_KEY")?.secret).toBe(true);

    const example = genEnvExample(schema);
    expect(example).toContain("EMAIL_PROVIDER=resend");
    expect(example).toContain("RESEND_API_KEY=");
    expect(example).toContain("EMAIL_FROM=OpenB2C <login@example.com>");
  });

  test("certificate request verification applies the chosen registry state model", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    const registryPublicKey = await services.initRegistryKeys();

    const userKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const userPublicKey = bytesToHex(await crypto.subtle.exportKey("raw", userKeys.publicKey));
    const cert = await services.issueCertificate("revoked@example.com", userPublicKey);

    let timestamp = String(Date.now());
    let signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);

    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();

    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      false,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toMatchObject({
      email: "revoked@example.com",
      publicKey: userPublicKey,
    });

    db.query(`
      INSERT INTO identity_registry (email, public_key, revoked)
      VALUES (?, ?, 1)
    `).run(cert.email, cert.publicKey);

    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      false,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();

    db.query("UPDATE identity_registry SET revoked = 0 WHERE email = ?").run(cert.email);
    timestamp = String(Date.now() + 1);
    signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toMatchObject({
      email: "revoked@example.com",
      publicKey: userPublicKey,
    });
  });

  test("generated REST identity challenge flow issues a browser-usable session", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "identity-rest.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "true";
    process.env.NODE_ENV = "test";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const keypair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
      const publicKey = bytesToHex(await crypto.subtle.exportKey("raw", keypair.publicKey));

      const challenge = await fetch(`${base}/identity/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "login@example.test", publicKey }),
      });
      expect(challenge.status).toBe(200);
      const challengeBody = await challenge.json() as { challengeId: number; code: string };
      expect(challengeBody.challengeId).toBeGreaterThan(0);
      expect(challengeBody.code).toMatch(/^\d{6}$/);

      const signature = await signText(keypair.privateKey, challengeBody.code);
      const verified = await fetch(`${base}/identity/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          code: challengeBody.code,
          signature,
        }),
      });
      expect(verified.status).toBe(200);
      const verifiedBody = await verified.json() as {
        certificate: { email: string; publicKey: string };
        sessionToken: string;
        sessionExpiresAt: string;
        auth: { userId: number; scopes: string[] };
      };
      expect(verifiedBody.certificate).toMatchObject({ email: "login@example.test", publicKey });
      expect(verifiedBody.sessionToken).toStartWith("sess_");
      expect(Array.isArray(verifiedBody.auth.scopes)).toBe(true);

      const context = await fetch(`${base}/auth/context`, {
        headers: { Authorization: `Bearer ${verifiedBody.sessionToken}` },
      });
      expect(context.status).toBe(200);
      expect(await context.json()).toEqual(verifiedBody.auth);

      const revoked = await fetch(`${base}/auth/revoke-current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${verifiedBody.sessionToken}` },
      });
      expect(revoked.status).toBe(200);
      expect(await revoked.json()).toEqual({ revoked: true });

      const afterRevoke = await fetch(`${base}/auth/context`, {
        headers: { Authorization: `Bearer ${verifiedBody.sessionToken}` },
      });
      expect(afterRevoke.status).toBe(401);
    } finally {
      server.stop(true);
      clearServerEnv();
    }
  });

  test("production identity challenge sends OTP through Resend without returning the code", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const deliveries: Array<{ path: string; headers: Record<string, string>; body: any }> = [];
    const resend = Bun.serve({
      port: 0,
      async fetch(req) {
        deliveries.push({
          path: new URL(req.url).pathname,
          headers: Object.fromEntries(req.headers),
          body: await req.json(),
        });
        return Response.json({ id: "email_test_123" });
      },
    });
    const dir = writeGenerated();
    let server: Bun.Server | null = null;

    try {
      process.env.NODE_ENV = "production";
      process.env.DB_PATH = join(dir, "identity-prod-email.sqlite");
      process.env.PORT = "0";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS = "true";
      process.env.RESEND_API_KEY = "re_test_identity";
      process.env.RESEND_EMAILS_URL = `http://127.0.0.1:${resend.port}/emails`;
      process.env.EMAIL_FROM = "OpenB2C <login@example.test>";

      ({ server } = await import(`${pathToFileURL(join(dir, "server.ts")).href}?production-email=${Date.now()}`));
      const base = `http://127.0.0.1:${server.port}`;
      const keypair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
      const publicKey = bytesToHex(await crypto.subtle.exportKey("raw", keypair.publicKey));

      const challenge = await fetch(`${base}/identity/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "prod-login@example.test", publicKey }),
      });
      expect(challenge.status).toBe(200);
      const challengeBody = await challenge.json() as { challengeId: number; message: string; code?: string };
      expect(challengeBody.challengeId).toBeGreaterThan(0);
      expect(challengeBody.message).toBe("verification code sent to email");
      expect(challengeBody.code).toBeUndefined();

      expect(deliveries).toHaveLength(1);
      const delivery = deliveries[0];
      expect(delivery.path).toBe("/emails");
      expect(delivery.headers.authorization).toBe("Bearer re_test_identity");
      expect(delivery.headers["idempotency-key"]).toBe(`identity-challenge-${challengeBody.challengeId}`);
      expect(delivery.body).toMatchObject({
        from: "OpenB2C <login@example.test>",
        to: ["prod-login@example.test"],
        subject: "OpenB2C sign-in code",
      });
      expect(delivery.body.html).toContain("Your sign-in code for OpenB2C is:");
      const code = String(delivery.body.text).match(/\b\d{6}\b/)?.[0];
      expect(code).toBeDefined();

      const signature = await signText(keypair.privateKey, code!);
      const verified = await fetch(`${base}/identity/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challengeBody.challengeId, code, signature }),
      });
      expect(verified.status).toBe(200);
      const verifiedBody = await verified.json() as { certificate: { email: string; publicKey: string }; sessionToken: string };
      expect(verifiedBody.certificate).toMatchObject({ email: "prod-login@example.test", publicKey });
      expect(verifiedBody.sessionToken).toStartWith("sess_");
    } finally {
      server?.stop(true);
      resend.stop(true);
      clearServerEnv();
      if (previousNodeEnv !== undefined) process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("fake identity email provider captures OTPs for production-like local tests", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const dir = writeGenerated();
    let server: Bun.Server | null = null;

    try {
      process.env.NODE_ENV = "production";
      process.env.DB_PATH = join(dir, "identity-fake-email.sqlite");
      process.env.PORT = "0";
      process.env.AUTH_ENABLED = "false";
      process.env.ALLOW_INSECURE_AUTH_DISABLED = "true";
      process.env.CORS_ORIGINS = "https://app.example";
      process.env.ALLOW_EPHEMERAL_REGISTRY_KEYS = "true";
      process.env.EMAIL_PROVIDER = "fake";
      process.env.ALLOW_FAKE_PROVIDERS = "true";

      ({ server } = await import(`${pathToFileURL(join(dir, "server.ts")).href}?fake-email=${Date.now()}`));
      const base = `http://127.0.0.1:${server.port}`;
      const keypair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
      const publicKey = bytesToHex(await crypto.subtle.exportKey("raw", keypair.publicKey));

      const challenge = await fetch(`${base}/identity/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "fake-login@example.test", publicKey }),
      });
      expect(challenge.status).toBe(200);
      const challengeBody = await challenge.json() as { challengeId: number; message: string; code?: string };
      expect(challengeBody.message).toBe("verification code sent to email");
      expect(challengeBody.code).toBeUndefined();

      const outbox = await fetch(`${base}/ops/fake-emails`);
      expect(outbox.status).toBe(200);
      const outboxBody = await outbox.json() as { items: Array<{ provider: string; to: string; text: string; challengeId: number }> };
      expect(outboxBody.items).toHaveLength(1);
      expect(outboxBody.items[0]).toMatchObject({
        provider: "fake",
        to: "fake-login@example.test",
        challengeId: challengeBody.challengeId,
      });
      const code = outboxBody.items[0].text.match(/\b\d{6}\b/)?.[0];
      expect(code).toBeDefined();

      const signature = await signText(keypair.privateKey, code!);
      const verified = await fetch(`${base}/identity/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challengeBody.challengeId, code, signature }),
      });
      expect(verified.status).toBe(200);
      const verifiedBody = await verified.json() as { certificate: { email: string; publicKey: string }; sessionToken: string };
      expect(verifiedBody.certificate).toMatchObject({ email: "fake-login@example.test", publicKey });
      expect(verifiedBody.sessionToken).toStartWith("sess_");
    } finally {
      server?.stop(true);
      clearServerEnv();
      if (previousNodeEnv !== undefined) process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("identity challenge creation is rate limited by email, public key, and IP", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);

    const emailDb = createDb();
    for (let i = 0; i < 3; i++) {
      expect((await services.createChallenge(emailDb, "same@example.com", `pk-email-${i}`, `10.0.0.${i}`)).ok).toBe(true);
    }
    const emailLimited = await services.createChallenge(emailDb, "same@example.com", "pk-email-4", "10.0.0.4");
    expect(emailLimited).toMatchObject({
      ok: false,
      code: "rate_limited",
      error: "too many identity challenges for email",
    });

    const publicKeyDb = createDb();
    for (let i = 0; i < 3; i++) {
      expect((await services.createChallenge(publicKeyDb, `pk${i}@example.com`, "same-public-key", `10.0.1.${i}`)).ok).toBe(true);
    }
    const publicKeyLimited = await services.createChallenge(publicKeyDb, "pk4@example.com", "same-public-key", "10.0.1.4");
    expect(publicKeyLimited).toMatchObject({
      ok: false,
      code: "rate_limited",
      error: "too many identity challenges for public key",
    });

    const ipDb = createDb();
    for (let i = 0; i < 10; i++) {
      expect((await services.createChallenge(ipDb, `ip${i}@example.com`, `pk-ip-${i}`, "10.0.2.1")).ok).toBe(true);
    }
    const ipLimited = await services.createChallenge(ipDb, "ip11@example.com", "pk-ip-11", "10.0.2.1");
    expect(ipLimited).toMatchObject({
      ok: false,
      code: "rate_limited",
      error: "too many identity challenges for IP address",
    });
  });

  test("identity challenge OTPs are stored as hashes and verify with the raw code", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    await services.initRegistryKeys();

    const userKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const userPublicKey = bytesToHex(await crypto.subtle.exportKey("raw", userKeys.publicKey));
    const challenge = await services.createChallenge(db, "otp@example.com", userPublicKey, "10.0.4.1");
    expect(challenge.ok).toBe(true);

    const row = db.query("SELECT code_hash FROM identity_challenge WHERE id = ?").get(challenge.data.challengeId) as { code_hash: string };
    expect(row.code_hash).not.toBe(challenge.data.code);
    expect(row.code_hash).toStartWith("$2");
    await expect(Bun.password.verify(challenge.data.code, row.code_hash)).resolves.toBe(true);

    const signature = await signText(userKeys.privateKey, challenge.data.code);
    const verified = await services.verifyChallenge(db, challenge.data.challengeId, challenge.data.code, signature);
    expect(verified).toMatchObject({
      ok: true,
      data: {
        email: "otp@example.com",
        publicKey: userPublicKey,
      },
    });
    const remaining = db.query("SELECT COUNT(*) as n FROM identity_challenge WHERE id = ?").get(challenge.data.challengeId) as { n: number };
    expect(remaining.n).toBe(0);
  });

  test("identity challenge cleanup deletes expired and used challenges", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    const codeHash = await Bun.password.hash("123456", { algorithm: "bcrypt", cost: 4 });

    db.query(`
      INSERT INTO identity_challenge (id, email, code_hash, public_key, expires_at, used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, "expired@example.com", codeHash, "pk-expired", new Date(Date.now() - 60_000).toISOString(), 0);
    db.query(`
      INSERT INTO identity_challenge (id, email, code_hash, public_key, expires_at, used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(2, "used@example.com", codeHash, "pk-used", new Date(Date.now() + 60_000).toISOString(), 1);
    db.query(`
      INSERT INTO identity_challenge (id, email, code_hash, public_key, expires_at, used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(3, "active@example.com", codeHash, "pk-active", new Date(Date.now() + 60_000).toISOString(), 0);

    expect(services.cleanupIdentityChallenges(db)).toEqual({ deleted: 2 });
    const rows = db.query("SELECT id FROM identity_challenge ORDER BY id").all() as { id: number }[];
    expect(rows.map(row => row.id)).toEqual([3]);
  });

  test("certificate rotation reissues active keys and invalidates previous keys in local registry mode", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    const registryPublicKey = await services.initRegistryKeys();

    const oldKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const oldIdentity = await issueThroughChallenge(services, db, "rotate@example.com", oldKeys, "10.0.5.1");
    expect(services.upsertIdentityRegistry(db, "rotate@example.com", oldIdentity.publicKey)).toEqual({
      rotated: false,
      reissued: true,
    });

    let timestamp = String(Date.now());
    let signature = await signRequest(oldKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      oldIdentity.cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toMatchObject({ email: "rotate@example.com" });

    const newKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const newIdentity = await issueThroughChallenge(services, db, "rotate@example.com", newKeys, "10.0.5.2");
    expect(newIdentity.publicKey).not.toBe(oldIdentity.publicKey);

    timestamp = String(Date.now());
    signature = await signRequest(oldKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      oldIdentity.cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();

    signature = await signRequest(newKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      newIdentity.cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toMatchObject({
      email: "rotate@example.com",
      publicKey: newIdentity.publicKey,
    });
  });

  test("certificate request verification rejects expired, revoked, malformed, replayed, and wrong-key requests", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    const registryPublicKey = await services.initRegistryKeys();

    const userKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const wrongKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const userPublicKey = bytesToHex(await crypto.subtle.exportKey("raw", userKeys.publicKey));
    const cert = await services.issueCertificate("negative@example.com", userPublicKey);
    services.upsertIdentityRegistry(db, cert.email, cert.publicKey);

    let timestamp = String(Date.now());
    let signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);
    const expiredCert = await services.issueCertificate("negative@example.com", userPublicKey, -1_000);
    await expect(services.verifyRequest(
      db,
      expiredCert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();

    db.query("UPDATE identity_registry SET revoked = 1 WHERE email = ?").run(cert.email);
    timestamp = String(Date.now() + 1);
    signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();
    db.query("UPDATE identity_registry SET revoked = 0 WHERE email = ?").run(cert.email);

    timestamp = String(Date.now() + 2);
    signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      { ...cert, signature: "not-hex" },
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();

    timestamp = String(Date.now() + 3);
    signature = await signRequest(wrongKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();

    timestamp = String(Date.now() + 4);
    signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);
    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toMatchObject({ email: "negative@example.com" });
    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
      true,
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toBeNull();
  });

  test("current certificate revocation invalidates the active identity session", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    const registryPublicKey = await services.initRegistryKeys();

    const userKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const identity = await issueThroughChallenge(services, db, "session@example.com", userKeys, "10.0.6.1");

    let timestamp = String(Date.now());
    let signature = await signRequest(userKeys.privateKey, "GET", "/auth/context", timestamp);
    await expect(services.verifyRequest(
      db,
      identity.cert,
      registryPublicKey,
      true,
      "GET",
      "/auth/context",
      timestamp,
      signature
    )).resolves.toMatchObject({ email: "session@example.com" });

    expect(services.revokeCertificate(db, identity.cert)).toEqual({ ok: true, data: { revoked: true } });
    expect(services.getCertificateRegistryState(db, identity.cert)).toBe("revoked");

    timestamp = String(Date.now() + 1);
    signature = await signRequest(userKeys.privateKey, "GET", "/auth/context", timestamp);
    await expect(services.verifyRequest(
      db,
      identity.cert,
      registryPublicKey,
      true,
      "GET",
      "/auth/context",
      timestamp,
      signature
    )).resolves.toBeNull();
  });

  test("identity session tokens are hashed, reusable across reloads, and revocable", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();

    const session = await services.issueIdentitySession(db, 42);
    expect(session.ok).toBe(true);
    expect(session.data.token).toStartWith("sess_");

    const row = db.query("SELECT user_id, token_hash, token_prefix, revoked FROM identity_session").get() as {
      user_id: number;
      token_hash: string;
      token_prefix: string;
      revoked: number;
    };
    expect(row.user_id).toBe(42);
    expect(row.token_hash).not.toBe(session.data.token);
    expect(row.token_prefix).toBe(session.data.token.slice(0, 16));
    expect(row.revoked).toBe(0);

    await expect(services.verifyIdentitySession(db, session.data.token)).resolves.toEqual({
      userId: 42,
      scopes: services.SELF_SERVICE_SCOPES,
    });

    await expect(services.revokeIdentitySessionToken(db, session.data.token)).resolves.toEqual({ ok: true, data: { revoked: true } });
    await expect(services.verifyIdentitySession(db, session.data.token)).resolves.toBeNull();
  });

  test("identity verification attempts are rate limited by challenge and email", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);

    const challengeDb = createDb();
    const challenge = await services.createChallenge(challengeDb, "challenge@example.com", "public-key", "10.0.3.1");
    expect(challenge.ok).toBe(true);
    for (let i = 0; i < 5; i++) {
      const result = await services.verifyChallenge(challengeDb, challenge.data.challengeId, "wrong", "00");
      expect(result).toMatchObject({ ok: false, code: "invalid", error: "incorrect code" });
    }
    const challengeLimited = await services.verifyChallenge(challengeDb, challenge.data.challengeId, "wrong", "00");
    expect(challengeLimited).toMatchObject({
      ok: false,
      code: "rate_limited",
      error: "too many identity verification attempts for challenge",
    });

    const emailDb = createDb();
    const codeHash = await Bun.password.hash("123456", { algorithm: "bcrypt", cost: 4 });
    for (let i = 1; i <= 11; i++) {
      emailDb.query(`
        INSERT INTO identity_challenge (id, email, code_hash, public_key, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(i, "email-limit@example.com", codeHash, `pk-${i}`, new Date(Date.now() + 60_000).toISOString());
    }
    for (let i = 1; i <= 10; i++) {
      const result = await services.verifyChallenge(emailDb, i, "wrong", "00");
      expect(result).toMatchObject({ ok: false, code: "invalid", error: "incorrect code" });
    }
    const emailLimited = await services.verifyChallenge(emailDb, 11, "wrong", "00");
    expect(emailLimited).toMatchObject({
      ok: false,
      code: "rate_limited",
      error: "too many identity verification attempts for email",
    });
  });
});
