import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genOpenAPI } from "./openapi";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { validateSchema } from "./validation";
import type { Column, Operation, Schema } from "./types";
import { fieldDisplayLabel, orderedSchemaFields } from "../ui/format";

const baseColumn: Column = {
  type: "text",
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

function col(overrides: Partial<Column>): Column {
  return { ...baseColumn, ...overrides };
}

function publicOp(): Operation {
  return { guard: null, relationships: [], public: true, scope: null, set: {}, cascade: [], effects: [] };
}

function metadataSchema(): Schema {
  return {
    organization: { name: "Metadata Test", description: "Metadata test app", logo: null },
    tables: {
      user: {
        id: col({ type: "integer", pk: true, auto: true }),
        email: col({
          required: true,
          unique: true,
          metadata: {
            label: "Email address",
            helpText: "Used for account access.",
            placeholder: "you@example.com",
            format: "email",
            displayPriority: 10,
          },
          validation: { minLength: 5, maxLength: 120 },
        }),
        name: col({
          required: true,
          metadata: { label: "Full name", displayPriority: 20 },
          validation: { minLength: 1, maxLength: 80 },
        }),
        status: col({
          default: "'active'",
          metadata: { label: "Status", displayPriority: 30 },
          validation: { enum: ["active", "disabled"] },
        }),
        age: col({
          type: "integer",
          metadata: { label: "Age", displayPriority: 40 },
          validation: { minimum: 13, maximum: 120 },
        }),
        secret_token: col({
          metadata: {
            label: "Secret token",
            privacy: "secret",
            redact: true,
          },
        }),
      },
    },
    operations: {
      user: {
        read: publicOp(),
        create: publicOp(),
        update: publicOp(),
      },
    },
  };
}

describe("field metadata generation", () => {
  test("threads metadata and validation rules into OpenAPI schemas", () => {
    const openapi = JSON.parse(genOpenAPI(metadataSchema()));
    const input = openapi.components.schemas.UserInput.properties;

    expect(input.email.title).toBe("Email address");
    expect(input.email.description).toBe("Used for account access.");
    expect(input.email.format).toBe("email");
    expect(input.email.minLength).toBe(5);
    expect(input.email.maxLength).toBe(120);
    expect(input.email["x-openb2c-field"]).toMatchObject({
      label: "Email address",
      helpText: "Used for account access.",
      placeholder: "you@example.com",
      displayPriority: 10,
    });
    expect(input.status.enum).toEqual(["active", "disabled"]);
    expect(input.age.minimum).toBe(13);
    expect(input.age.maximum).toBe(120);
    expect(input.secret_token["x-openb2c-field"]).toMatchObject({
      privacy: "secret",
      redact: true,
    });
  });

  test("uses redaction metadata for generated REST responses", () => {
    const routes = genRoutes(metadataSchema());
    expect(routes).toContain('"user": [');
    expect(routes).toContain('"secret_token"');
  });

  test("generated UI helpers use metadata labels, ordering, and redaction hints", () => {
    const openapi = JSON.parse(genOpenAPI(metadataSchema()));
    const schema = openapi.components.schemas.UserInput;
    expect(orderedSchemaFields(schema).map(([name]) => name)).toEqual(["email", "name", "status", "age"]);
    expect(fieldDisplayLabel("email", schema.properties.email)).toBe("Email address");
  });

  test("generated services enforce per-field validation metadata", async () => {
    const schema = metadataSchema();
    const dir = mkdtempSync(join(tmpdir(), "openb2c-field-metadata-"));
    writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
    writeFileSync(join(dir, "services.ts"), genServices(schema));

    const services = await import(`${pathToFileURL(join(dir, "services.ts")).href}?${Date.now()}`);
    const db = new Database(":memory:");
    db.exec(genSQL(schema.tables, schema.indexes));

    try {
      expect(services.createUser(db, { email: "bad", name: "Ada", status: "active", age: 42 }).ok).toBe(false);
      expect(services.createUser(db, { email: "ada@example.test", name: "Ada", status: "archived", age: 42 }).error).toContain("Status must be one of");
      expect(services.createUser(db, { email: "ada@example.test", name: "Ada", status: "active", age: 12 }).error).toContain("Age must be at least 13");
      expect(services.createUser(db, { email: "ada@example.test", name: "Ada", status: "active", age: 42 }).ok).toBe(true);
    } finally {
      db.close();
    }
  });

  test("validates malformed metadata rules before generation", () => {
    const schema = metadataSchema();
    schema.tables.user.age.validation = { minimum: 120, maximum: 13 };
    schema.tables.user.email.validation = { pattern: "[" };
    schema.tables.user.status.metadata = { privacy: "private" as any };

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tables.user.age.validation" }),
      expect.objectContaining({ path: "tables.user.email.validation.pattern" }),
      expect.objectContaining({ path: "tables.user.status.metadata.privacy" }),
    ]));
  });
});
