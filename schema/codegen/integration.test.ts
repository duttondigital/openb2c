import { describe, expect, test } from "bun:test";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { genRowInterface } from "./typescript";
import type { Column, Tables } from "./types";

describe("integration: SQL and Types consistency", () => {
  test("same schema produces matching SQL and types", () => {
    const tables: Tables = {
      performance: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      ticket: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        performance_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "performance(id)" },
        customer_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "customer(id)" },
        seat: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
        price_pence: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        status: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'reserved'", references: null },
      },
    };

    const sql = genSQL(tables);
    const types = genTypes(tables);

    // SQL should have all columns
    expect(sql).toContain("id INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(sql).toContain("performance_id INTEGER NOT NULL REFERENCES performance(id)");
    expect(sql).toContain("customer_id INTEGER NOT NULL REFERENCES customer(id)");
    expect(sql).toContain("seat TEXT");
    expect(sql).toContain("price_pence INTEGER NOT NULL");
    expect(sql).toContain("status TEXT DEFAULT 'reserved'");

    // Types should have matching structure
    expect(types).toContain("export interface Ticket {");
    expect(types).toContain("performance_id: number;");
    expect(types).toContain("customer_id: number;");
    expect(types).toContain("seat: string | null;");
    expect(types).toContain("price_pence: number;");
    expect(types).toContain("status: string | null;");

    // Input should not have auto pk
    expect(types).toContain("export interface TicketInput {");
    expect(types).not.toMatch(/TicketInput \{[^}]*\bid:/);
  });
});

describe("edge cases", () => {
  const baseCol: Column = {
    type: "text",
    pk: false,
    auto: false,
    required: false,
    unique: false,
    default: null,
    references: null,
  };

  test("table with no columns (edge case)", () => {
    const sql = genSQL({ empty: {} });
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS empty (\n\n);");
  });

  test("column names with numbers", () => {
    const result = genRowInterface("test", {
      field1: { ...baseCol, required: true },
      field_2: { ...baseCol, required: true },
    });
    expect(result).toContain("field1: string;");
    expect(result).toContain("field_2: string;");
  });
});
