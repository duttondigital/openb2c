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
      code: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
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

async function signRequest(privateKey: CryptoKey, method: string, path: string, timestamp: string): Promise<string> {
  return bytesToHex(await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(`${method} ${path} ${timestamp}`)
  ));
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

    const timestamp = String(Date.now());
    const signature = await signRequest(userKeys.privateKey, "GET", "/api/users/1", timestamp);

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
    for (let i = 1; i <= 11; i++) {
      emailDb.query(`
        INSERT INTO identity_challenge (id, email, code, public_key, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(i, "email-limit@example.com", "123456", `pk-${i}`, new Date(Date.now() + 60_000).toISOString());
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
