import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { genOpenAPI } from "./openapi";
import { genServices } from "./services";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { validateSchema } from "./validation";
import type { Column, Operation, Schema } from "./types";

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

function op(overrides: Partial<Operation> = {}): Operation {
  return { guard: null, relationships: [], public: true, scope: null, policy: {}, workflow: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function validationSchema(): Schema {
  return {
    organization: { name: "Validation Test", description: "Validation metadata test app", logo: null },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        ticket_type: col({
          default: "'standard'",
          validation: { enum: ["standard", "vip"] },
        }),
        price_pence: col({
          type: "integer",
          required: true,
          validation: { minimum: 0, maximum: 100000 },
        }),
      },
    },
    validations: {
      ticket: {
        vipPriceMinimum: {
          fields: [
            { table: "ticket", field: "ticket_type", references: null },
            { table: "ticket", field: "price_pence", references: null },
          ],
          expression: {
            _t: "bin",
            op: "||",
            left: {
              _t: "bin",
              op: "!=",
              left: { _t: "field", name: "ticket_type" },
              right: { _t: "lit", value: "vip" },
            },
            right: {
              _t: "bin",
              op: ">=",
              left: { _t: "field", name: "price_pence" },
              right: { _t: "lit", value: 2500 },
            },
          },
          message: "VIP tickets must cost at least GBP 25.00.",
        },
      },
    },
    operations: {
      ticket: {
        create: op(),
        update: op(),
      },
    },
  };
}

describe("validation metadata generation", () => {
  test("threads field and cross-field validation metadata into OpenAPI", () => {
    const openapi = JSON.parse(genOpenAPI(validationSchema()));

    expect(openapi.components.schemas.TicketInput.properties.ticket_type.enum).toEqual(["standard", "vip"]);
    expect(openapi.components.schemas.TicketInput.properties.price_pence.minimum).toBe(0);
    expect(openapi.components.schemas.TicketInput.properties.price_pence.maximum).toBe(100000);
    expect(openapi["x-openb2c-validation"].crossFieldConstraints.ticket.vipPriceMinimum).toMatchObject({
      fields: [
        { table: "ticket", field: "ticket_type", references: null },
        { table: "ticket", field: "price_pence", references: null },
      ],
      message: "VIP tickets must cost at least GBP 25.00.",
    });
  });

  test("generated services enforce cross-field constraints on create and partial update", async () => {
    const schema = validationSchema();
    const dir = mkdtempSync(join(tmpdir(), "openb2c-validation-metadata-"));
    writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations));
    writeFileSync(join(dir, "services.ts"), genServices(schema));

    const services = await import(`${pathToFileURL(join(dir, "services.ts")).href}?${Date.now()}`);
    const db = new Database(":memory:");
    db.exec(genSQL(schema.tables, schema.indexes));

    try {
      expect(services.createTicket(db, { ticket_type: "vip", price_pence: 2000 }).error).toBe("VIP tickets must cost at least GBP 25.00.");
      const created = services.createTicket(db, { ticket_type: "standard", price_pence: 2000 });
      expect(created.ok).toBe(true);
      expect(services.updateTicket(db, created.data.id, { ticket_type: "vip" }).error).toBe("VIP tickets must cost at least GBP 25.00.");
      expect(services.updateTicket(db, created.data.id, { ticket_type: "vip", price_pence: 2500 }).ok).toBe(true);
    } finally {
      db.close();
    }
  });

  test("validates malformed cross-field validation metadata", () => {
    const schema = validationSchema();
    schema.validations!.ticket.vipPriceMinimum.fields = [
      { table: "ticket", field: "ticket_type", references: null },
    ];
    schema.validations!.ticket.vipPriceMinimum.expression = { _t: "field", name: "missing" };
    schema.validations!.ticket.related = {
      fields: [
        { table: "ticket", field: "ticket_type", references: null },
        { table: "ticket", field: "price_pence", references: null },
      ],
      expression: { _t: "rel", entity: "user", field: "email" },
      message: "",
    } as any;

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "validations.ticket.vipPriceMinimum.fields" }),
      expect.objectContaining({ path: "validations.ticket.vipPriceMinimum.expression.name" }),
      expect.objectContaining({ path: "validations.ticket.vipPriceMinimum.fields" }),
      expect.objectContaining({ path: "validations.ticket.related.expression" }),
      expect.objectContaining({ path: "validations.ticket.related.message" }),
    ]));
  });
});
