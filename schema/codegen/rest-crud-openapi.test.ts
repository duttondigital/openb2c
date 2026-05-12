import { describe, expect, test } from "bun:test";
import { genOpenAPI } from "./openapi";
import type { Column, Schema } from "./types";

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

function schema(): Schema {
  return {
    organization: { name: "CRUD OpenAPI", description: "CRUD OpenAPI test app", logo: null },
    tables: {
      note: {
        id: col({ type: "integer", pk: true, auto: true }),
        title: col({ required: true }),
      },
    },
    operations: {},
  };
}

describe("CRUD OpenAPI response schemas", () => {
  test("generates concrete create update and delete result components", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));

    expect(openapi.components.schemas.NoteCreateResult).toMatchObject({
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    });
    expect(openapi.components.schemas.NoteUpdateResult).toMatchObject({
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    });
    expect(openapi.components.schemas.NoteDeleteResult).toMatchObject({
      type: "object",
      properties: { deleted: { type: "boolean", enum: [true] } },
      required: ["deleted"],
      additionalProperties: false,
    });
  });

  test("CRUD endpoints reference generated response components", () => {
    const openapi = JSON.parse(genOpenAPI(schema()));

    expect(openapi.paths["/api/notes"].post.responses["201"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/NoteCreateResult",
    });
    expect(openapi.paths["/api/notes/{id}"].put.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/NoteUpdateResult",
    });
    expect(openapi.paths["/api/notes/{id}"].delete.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/NoteDeleteResult",
    });
  });
});
