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
import { fieldDisplayLabel, filterableSchemaFields, formatValue, labelFor, listFieldDisplayLabel, listSchemaFields, orderedSchemaFields } from "../ui/format";

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
        bio: col({
          metadata: { label: "Biography", format: "textarea", displayPriority: 25 },
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
    expect(orderedSchemaFields(schema).map(([name]) => name)).toEqual(["email", "name", "bio", "status", "age"]);
    expect(listSchemaFields(schema).map(([name]) => name)).toEqual(["email", "name", "status", "age"]);
    expect(filterableSchemaFields(schema).map(([name]) => name)).toEqual(["status"]);
    expect(fieldDisplayLabel("email", schema.properties.email)).toBe("Email address");
  });

  test("generated UI list helpers prefer record names over derived display labels", () => {
    const schema = {
      properties: {
        name: {
          title: "Performance",
          "x-openb2c-field": { displayPriority: 10 },
        },
        display_title: {
          title: "Display title",
          readOnly: true,
          "x-openb2c-field": { displayPriority: 15 },
          "x-openb2c-derived": { displayOnly: true },
        },
        duration_mins: {
          title: "Duration",
          "x-openb2c-field": { displayPriority: 20 },
        },
      },
    };

    expect(listSchemaFields(schema).map(([name]) => name)).toEqual(["name", "duration_mins"]);
    expect(listFieldDisplayLabel("name", schema.properties.name, true)).toBe("Name");
    expect(formatValue("duration_mins", 150)).toBe("2h 30m");
    expect(formatValue("duration_mins", 120)).toBe("2h");
    expect(labelFor({ id: 1, name: "The Magic Flute", date: "2026-06-12", time: "19:30" })).toBe("The Magic Flute");
    expect(labelFor({ id: 2, starts_at: "2026-06-27T19:30:00Z" })).toBe("27 Jun 2026 at 19:30");
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

  test("generated services reject past temporal business fields but ignore system timestamps", async () => {
    const schema: Schema = {
      organization: { name: "Temporal Test", description: "Temporal test app", logo: null },
      tables: {
        event: {
          id: col({ type: "integer", pk: true, auto: true }),
          name: col({ required: true, metadata: { label: "Name" } }),
          starts_at: col({ required: true, metadata: { label: "Starts", format: "date-time" } }),
          date: col({ required: true, metadata: { label: "Date", format: "date" } }),
          time: col({ required: true, metadata: { label: "Time", format: "time" } }),
          created_at: col({ default: "CURRENT_TIMESTAMP", metadata: { label: "Created", format: "date-time" } }),
          updated_at: col({ default: "CURRENT_TIMESTAMP", metadata: { label: "Updated", format: "date-time" } }),
        },
      },
      operations: {
        event: {
          read: publicOp(),
          create: publicOp(),
          update: publicOp(),
        },
      },
    };
    const dir = mkdtempSync(join(tmpdir(), "openb2c-temporal-validation-"));
    writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
    writeFileSync(join(dir, "services.ts"), genServices(schema));

    const services = await import(`${pathToFileURL(join(dir, "services.ts")).href}?${Date.now()}`);
    const db = new Database(":memory:");
    db.exec(genSQL(schema.tables, schema.indexes));
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowDate = tomorrow.toISOString().slice(0, 10);
    const tomorrowTime = tomorrow.toISOString().slice(11, 16);

    try {
      expect(services.createEvent(db, {
        name: "Past event",
        starts_at: yesterday,
        date: tomorrowDate,
        time: tomorrowTime,
      }).error).toBe("Starts must be in the future");

      const created = services.createEvent(db, {
        name: "Future event",
        starts_at: tomorrow.toISOString(),
        date: tomorrowDate,
        time: tomorrowTime,
        created_at: "2000-01-01T00:00",
        updated_at: "2000-01-01T00:00",
      });
      expect(created.ok).toBe(true);
      const row = db.query<{ created_at: string; updated_at: string }, []>("SELECT created_at, updated_at FROM event WHERE id = 1").get();
      expect(row?.created_at).not.toBe("2000-01-01T00:00");
      expect(row?.updated_at).not.toBe("2000-01-01T00:00");
      expect(services.updateEvent(db, 1, { date: "2000-01-01", time: "00:00" }).error).toBe("Date must be in the future");
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
