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

describe("identity hardening generation", () => {
  test("registry keys are initialized before the server starts", () => {
    const server = genRoutes(schema);

    expect(server).toContain("async function initRegistryPublicKey(): Promise<string>");
    expect(server).toContain("const registryPubKey = await initRegistryPublicKey();");
    expect(server.indexOf("const registryPubKey = await initRegistryPublicKey();")).toBeLessThan(
      server.indexOf("const server = Bun.serve({")
    );
    expect(server).toContain("S.verifyRequest(db, cert, registryPubKey");
    expect(server).not.toContain("(async () => {");
  });

  test("certificate request verification rejects locally revoked certificates", async () => {
    const dir = writeGenerated();
    const services = await import(pathToFileURL(join(dir, "services.ts")).href);
    const db = createDb();
    const registryPublicKey = await services.initRegistryKeys();

    const userKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const userPublicKey = bytesToHex(await crypto.subtle.exportKey("raw", userKeys.publicKey));
    const cert = await services.issueCertificate("revoked@example.com", userPublicKey);
    db.query(`
      INSERT INTO identity_registry (email, public_key, revoked)
      VALUES (?, ?, 1)
    `).run(cert.email, cert.publicKey);

    const timestamp = String(Date.now());
    const message = `GET /api/users/1 ${timestamp}`;
    const signature = bytesToHex(await crypto.subtle.sign(
      "Ed25519",
      userKeys.privateKey,
      new TextEncoder().encode(message)
    ));

    await expect(services.verifyRequest(
      db,
      cert,
      registryPublicKey,
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
      "GET",
      "/api/users/1",
      timestamp,
      signature
    )).resolves.toMatchObject({
      email: "revoked@example.com",
      publicKey: userPublicKey,
    });
  });
});
