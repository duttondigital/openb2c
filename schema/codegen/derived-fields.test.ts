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

function derivedSchema(): Schema {
  return {
    organization: { name: "Derived Test", description: "Derived field test app", logo: null },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        ticket_type: col({ required: true }),
        seat: col({ required: true }),
        quantity: col({ type: "integer", required: true }),
        price_pence: col({ type: "integer", required: true }),
      },
    },
    derived: {
      ticket: {
        display_label: {
          type: "text",
          metadata: {
            label: "Display label",
            displayPriority: 5,
          },
          dependencies: [
            { table: "ticket", field: "ticket_type", references: null },
            { table: "ticket", field: "seat", references: null },
          ],
          template: "{ticket_type} ticket - {seat}",
        },
        total_pence: {
          type: "integer",
          metadata: {
            label: "Total",
            format: "money",
            displayPriority: 6,
          },
          dependencies: [
            { table: "ticket", field: "quantity", references: null },
            { table: "ticket", field: "price_pence", references: null },
          ],
          expression: {
            _t: "bin",
            op: "*",
            left: { _t: "field", name: "quantity" },
            right: { _t: "field", name: "price_pence" },
          },
        },
      },
    },
    operations: {
      ticket: {
        read: op(),
        create: op(),
        update: op(),
      },
    },
  };
}

describe("derived field generation", () => {
  test("includes derived fields in response schemas but excludes them from inputs", () => {
    const openapi = JSON.parse(genOpenAPI(derivedSchema()));
    const ticket = openapi.components.schemas.Ticket.properties;
    const input = openapi.components.schemas.TicketInput.properties;

    expect(ticket.display_label).toMatchObject({
      type: "string",
      readOnly: true,
      title: "Display label",
    });
    expect(ticket.display_label["x-openb2c-derived"]).toMatchObject({
      displayOnly: true,
      template: "{ticket_type} ticket - {seat}",
      dependencies: [
        { table: "ticket", field: "ticket_type", references: null },
        { table: "ticket", field: "seat", references: null },
      ],
    });
    expect(ticket.total_pence).toMatchObject({
      type: "integer",
      readOnly: true,
      title: "Total",
      format: "money",
    });
    expect(input.display_label).toBeUndefined();
    expect(input.total_pence).toBeUndefined();
  });

  test("includes derived fields in generated row types but not input types", () => {
    const types = genTypes(derivedSchema().tables, derivedSchema().operations, derivedSchema().derived);

    expect(types).toContain("display_label: string;");
    expect(types).toContain("total_pence: number;");
    expect(types).not.toContain("display_label?: string;");
    expect(types).not.toContain("total_pence?: number;");
  });

  test("generated services compute derived fields after reads", async () => {
    const schema = derivedSchema();
    const dir = mkdtempSync(join(tmpdir(), "openb2c-derived-fields-"));
    writeFileSync(join(dir, "types.ts"), genTypes(schema.tables, schema.operations, schema.derived));
    writeFileSync(join(dir, "services.ts"), genServices(schema));

    const services = await import(`${pathToFileURL(join(dir, "services.ts")).href}?${Date.now()}`);
    const db = new Database(":memory:");
    db.exec(genSQL(schema.tables, schema.indexes));

    try {
      const created = services.createTicket(db, {
        ticket_type: "vip",
        seat: "A1",
        quantity: 2,
        price_pence: 2500,
      });
      expect(created.ok).toBe(true);
      expect(services.findTicketById(db, created.data.id)).toMatchObject({
        display_label: "vip ticket - A1",
        total_pence: 5000,
      });
      expect(services.findAllTickets(db)).toEqual([
        expect.objectContaining({
          display_label: "vip ticket - A1",
          total_pence: 5000,
        }),
      ]);
    } finally {
      db.close();
    }
  });

  test("validates malformed derived field metadata", () => {
    const schema = derivedSchema();
    schema.derived!.ticket.seat = {
      type: "text",
      dependencies: [],
      template: "{missing}",
    };
    schema.derived!.ticket.display_label.dependencies = [
      { table: "ticket", field: "ticket_type", references: null },
    ];
    schema.derived!.ticket.total_pence.template = "{quantity}";

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "derived.ticket.seat" }),
      expect.objectContaining({ path: "derived.ticket.seat.template" }),
      expect.objectContaining({ path: "derived.ticket.display_label.dependencies" }),
      expect.objectContaining({ path: "derived.ticket.total_pence" }),
    ]));
  });
});
