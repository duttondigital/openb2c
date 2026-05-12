import { describe, expect, test } from "bun:test";
import { genOpenAPI } from "./openapi";
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
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, audit: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function schema(): Schema {
  return {
    organization: { name: "Operation OpenAPI", description: "Operation OpenAPI test app", logo: null },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
      },
    },
    operations: {
      ticket: {
        cancel: op({ set: { status: "cancelled" } }),
        ping: op(),
      },
    },
  };
}

describe("operation OpenAPI schemas", () => {
  test("generates request and response components for custom operations", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));

    expect(openapi.components.schemas.TicketCancelInput).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
      description: "This generated operation does not accept a request body.",
    });
    expect(openapi.components.schemas.TicketCancelResult).toMatchObject({
      type: "object",
      required: ["id", "status"],
      additionalProperties: false,
      properties: {
        id: { type: "integer" },
        status: { type: "string", enum: ["cancelled"] },
      },
    });
    expect(openapi.components.schemas.TicketPingResult.properties.status).toMatchObject({
      type: "string",
      description: "Operation status result.",
    });
  });

  test("operation endpoints reference generated request and response schemas", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));
    const cancel = openapi.paths["/api/tickets/{id}/cancel"].post;

    expect(cancel.requestBody).toMatchObject({
      required: false,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/TicketCancelInput" },
        },
      },
    });
    expect(cancel.responses["200"]).toMatchObject({
      description: "Success",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/TicketCancelResult" },
        },
      },
    });
  });
});
