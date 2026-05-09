import { describe, expect, test } from "bun:test";
import { tsType, genRowInterface, genInputInterface, genTypes } from "./typescript";
import type { Column, Operations, Tables } from "./types";

describe("tsType", () => {
  test("maps integer to number", () => {
    expect(tsType("integer")).toBe("number");
  });

  test("maps text to string", () => {
    expect(tsType("text")).toBe("string");
  });

  test("maps real to number", () => {
    expect(tsType("real")).toBe("number");
  });

  test("maps blob to Uint8Array", () => {
    expect(tsType("blob")).toBe("Uint8Array");
  });

  test("returns unknown for unmapped types", () => {
    expect(tsType("custom")).toBe("unknown");
    expect(tsType("")).toBe("unknown");
  });
});

describe("genRowInterface", () => {
  const baseCol: Column = {
    type: "text",
    pk: false,
    auto: false,
    required: false,
    unique: false,
    default: null,
    references: null,
  };

  test("simple table", () => {
    const result = genRowInterface("customer", {
      id: { ...baseCol, type: "integer", pk: true },
      name: { ...baseCol, required: true },
    });
    expect(result).toBe(`export interface Customer {
  id: number;
  name: string;
}`);
  });

  test("nullable fields", () => {
    const result = genRowInterface("person", {
      id: { ...baseCol, type: "integer", pk: true },
      email: { ...baseCol },
      phone: { ...baseCol },
    });
    expect(result).toContain("id: number;");
    expect(result).toContain("email: string | null;");
    expect(result).toContain("phone: string | null;");
  });

  test("snake_case table name becomes PascalCase", () => {
    const result = genRowInterface("order_item", {
      id: { ...baseCol, type: "integer", pk: true },
    });
    expect(result).toContain("export interface OrderItem");
  });

  test("all SQLite types mapped correctly", () => {
    const result = genRowInterface("types_test", {
      int_col: { ...baseCol, type: "integer", pk: true },
      text_col: { ...baseCol, type: "text", required: true },
      real_col: { ...baseCol, type: "real", required: true },
      blob_col: { ...baseCol, type: "blob", required: true },
    });
    expect(result).toContain("int_col: number;");
    expect(result).toContain("text_col: string;");
    expect(result).toContain("real_col: number;");
    expect(result).toContain("blob_col: Uint8Array;");
  });

  test("unknown type maps to unknown", () => {
    const result = genRowInterface("test", {
      weird: { ...baseCol, type: "custom_type", required: true },
    });
    expect(result).toContain("weird: unknown;");
  });
});

describe("genInputInterface", () => {
  const baseCol: Column = {
    type: "text",
    pk: false,
    auto: false,
    required: false,
    unique: false,
    default: null,
    references: null,
  };

  test("auto pk is excluded from input", () => {
    const result = genInputInterface("customer", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
      name: { ...baseCol, required: true },
    });
    expect(result).not.toContain("id:");
    expect(result).toContain("name: string;");
  });

  test("non-auto pk is included", () => {
    const result = genInputInterface("custom_id_table", {
      id: { ...baseCol, type: "text", pk: true, auto: false, required: true },
      name: { ...baseCol, required: true },
    });
    expect(result).toContain("id: string;");
    expect(result).toContain("name: string;");
  });

  test("optional fields have ?", () => {
    const result = genInputInterface("person", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
      name: { ...baseCol, required: true },
      email: { ...baseCol, required: false },
    });
    expect(result).toContain("name: string;");
    expect(result).toContain("email?: string;");
  });

  test("required fields do not have ?", () => {
    const result = genInputInterface("required_test", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
      a: { ...baseCol, required: true },
      b: { ...baseCol, required: true },
    });
    expect(result).toContain("a: string;");
    expect(result).toContain("b: string;");
    expect(result).not.toContain("?");
  });

  test("default values still make field optional", () => {
    const result = genInputInterface("defaults", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
      status: { ...baseCol, default: "'pending'" },
      created_at: { ...baseCol, default: "CURRENT_TIMESTAMP" },
    });
    expect(result).toContain("status?: string;");
    expect(result).toContain("created_at?: string;");
  });

  test("input interface with only auto pk has empty body", () => {
    const result = genInputInterface("id_only", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
    });
    expect(result).toBe(`export interface IdOnlyInput {

}`);
  });
});

describe("genTypes", () => {
  test("empty schema", () => {
    const result = genTypes({});
    expect(result).toContain("// Generated by schema/codegen.ts — do not edit");
    expect(result).toContain("export interface AuthContext");
    expect(result).toContain("export const ANONYMOUS_AUTH_CONTEXT");
    expect(result).not.toContain("export interface Customer");
  });

  test("single table generates both interfaces", () => {
    const tables: Tables = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      },
    };
    const result = genTypes(tables);
    expect(result).toContain("export interface Customer {");
    expect(result).toContain("export interface CustomerInput {");
    expect(result).toContain("// Generated by schema/codegen.ts");
  });

  test("relationship-backed create fields are optional in input interfaces", () => {
    const tables: Tables = {
      ticket: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        user_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "user(id)" },
        title: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      },
    };
    const operations: Operations = {
      ticket: {
        create: {
          guard: null,
          relationships: [{ field: { table: "ticket", field: "user_id", references: "user(id)" } }],
          public: false,
          scope: null,
          set: {},
          cascade: [],
          effects: [],
        },
      },
    };
    const result = genTypes(tables, operations);
    expect(result).toMatch(/export interface TicketInput \{[^}]*user_id\?: number;/);
    expect(result).toMatch(/export interface TicketInput \{[^}]*title: string;/);
  });

  test("multiple tables", () => {
    const tables: Tables = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      order: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
    };
    const result = genTypes(tables);
    expect(result).toContain("export interface Customer {");
    expect(result).toContain("export interface CustomerInput {");
    expect(result).toContain("export interface Order {");
    expect(result).toContain("export interface OrderInput {");
  });

  test("full realistic schema", () => {
    const tables: Tables = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        email: { type: "text", pk: false, auto: false, required: false, unique: true, default: null, references: null },
        phone: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
        created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
      },
    };
    const result = genTypes(tables);

    expect(result).toContain("id: number;");
    expect(result).toContain("name: string;");
    expect(result).toContain("email: string | null;");
    expect(result).toContain("phone: string | null;");
    expect(result).toContain("created_at: string | null;");

    expect(result).toMatch(/export interface CustomerInput \{[^}]*name: string;/);
    expect(result).toMatch(/export interface CustomerInput \{[^}]*email\?: string;/);
  });
});
