import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { genRoutes } from "./server";
import { genServices } from "./services";
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

    expect(server).toContain("async function initRegistryPublicKey(): Promise<string>");
    expect(server).toContain("const registryPubKey = await initRegistryPublicKey();");
    expect(server.indexOf("const registryPubKey = await initRegistryPublicKey();")).toBeLessThan(
      server.indexOf("const server = Bun.serve({")
    );
    expect(server).toContain("const USE_EXTERNAL_REGISTRY = !REGISTRY_PRIVATE_KEY && !!REGISTRY_PUBLIC_KEY;");
    expect(server).toContain("const REQUIRE_LOCAL_CERTIFICATE_REGISTRY = !USE_EXTERNAL_REGISTRY;");
    expect(server).toContain("S.verifyRequest(db, cert, registryPubKey, REQUIRE_LOCAL_CERTIFICATE_REGISTRY");
    expect(server).toContain("S.createChallenge(db, email, publicKey, clientIp(req))");
    expect(server).not.toContain("(async () => {");
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
