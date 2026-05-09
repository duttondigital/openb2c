import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import type { Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {
    note: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      title: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
    },
  },
  operations: {},
};

function writeGenerated(): string {
  const dir = mkdtempSync(join(tmpdir(), "openb2c-request-safety-"));
  writeFileSync(join(dir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(dir, "services.ts"), genServices(schema));
  writeFileSync(join(dir, "server.ts"), genRoutes(schema));
  return dir;
}

describe("generated request safety", () => {
  test("JSON endpoints enforce body limits, content type, and malformed JSON errors", async () => {
    const dir = writeGenerated();
    process.env.DB_PATH = join(dir, "request-safety.sqlite");
    process.env.PORT = "0";
    process.env.AUTH_ENABLED = "false";
    process.env.MAX_REQUEST_BODY_BYTES = "64";
    const { server } = await import(pathToFileURL(join(dir, "server.ts")).href);
    const base = `http://127.0.0.1:${server.port}`;

    try {
      const valid = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "ok" }),
      });
      expect(valid.status).toBe(201);

      const tooLarge = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x".repeat(100) }),
      });
      expect(tooLarge.status).toBe(413);
      expect(await tooLarge.json()).toMatchObject({
        code: "payload_too_large",
        error: "request body too large",
      });

      const wrongContentType = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ title: "ok" }),
      });
      expect(wrongContentType.status).toBe(415);
      expect(await wrongContentType.json()).toMatchObject({
        code: "unsupported_media_type",
        error: "content-type must be application/json",
      });

      const malformed = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"title":',
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({
        code: "invalid",
        error: "malformed JSON",
      });
    } finally {
      server.stop(true);
      delete process.env.DB_PATH;
      delete process.env.PORT;
      delete process.env.AUTH_ENABLED;
      delete process.env.MAX_REQUEST_BODY_BYTES;
    }
  });
});
