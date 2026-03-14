import { describe, expect, test } from "bun:test";
import {
  pascalCase,
  sqlType,
  genSQL,
  tsType,
  genRowInterface,
  genInputInterface,
  genTypes,
  type Column,
  type Schema,
} from "./codegen";

// ============================================================================
// pascalCase
// ============================================================================

describe("pascalCase", () => {
  test("converts snake_case to PascalCase", () => {
    expect(pascalCase("customer")).toBe("Customer");
    expect(pascalCase("order_item")).toBe("OrderItem");
    expect(pascalCase("created_at")).toBe("CreatedAt");
  });

  test("handles multiple underscores", () => {
    expect(pascalCase("order_line_item")).toBe("OrderLineItem");
    expect(pascalCase("a_b_c_d")).toBe("ABCD");
  });

  test("handles already capitalized", () => {
    expect(pascalCase("Customer")).toBe("Customer");
  });

  test("handles empty string", () => {
    expect(pascalCase("")).toBe("");
  });

  test("handles single character", () => {
    expect(pascalCase("a")).toBe("A");
  });

  // Note: leading/trailing underscores preserved (not expected in table names)

  test("handles numbers", () => {
    expect(pascalCase("order_2")).toBe("Order2");
    expect(pascalCase("v2_api")).toBe("V2Api");
  });
});

// ============================================================================
// tsType
// ============================================================================

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

// ============================================================================
// sqlType
// ============================================================================

describe("sqlType", () => {
  const baseCol: Column = {
    type: "text",
    pk: false,
    auto: false,
    required: false,
    unique: false,
    default: null,
    references: null,
  };

  test("basic type only", () => {
    expect(sqlType({ ...baseCol, type: "text" })).toBe("TEXT");
    expect(sqlType({ ...baseCol, type: "integer" })).toBe("INTEGER");
    expect(sqlType({ ...baseCol, type: "real" })).toBe("REAL");
  });

  test("primary key", () => {
    expect(sqlType({ ...baseCol, pk: true })).toBe("TEXT PRIMARY KEY");
  });

  test("primary key with autoincrement", () => {
    expect(sqlType({ ...baseCol, type: "integer", pk: true, auto: true })).toBe(
      "INTEGER PRIMARY KEY AUTOINCREMENT"
    );
  });

  test("required (NOT NULL)", () => {
    expect(sqlType({ ...baseCol, required: true })).toBe("TEXT NOT NULL");
  });

  test("required on pk does not duplicate NOT NULL", () => {
    // pk implies NOT NULL so we skip explicit NOT NULL
    expect(sqlType({ ...baseCol, pk: true, required: true })).toBe("TEXT PRIMARY KEY");
  });

  test("unique", () => {
    expect(sqlType({ ...baseCol, unique: true })).toBe("TEXT UNIQUE");
  });

  test("default value", () => {
    expect(sqlType({ ...baseCol, default: "CURRENT_TIMESTAMP" })).toBe(
      "TEXT DEFAULT CURRENT_TIMESTAMP"
    );
    expect(sqlType({ ...baseCol, default: "'pending'" })).toBe("TEXT DEFAULT 'pending'");
  });

  test("foreign key reference", () => {
    expect(sqlType({ ...baseCol, type: "integer", references: "customer(id)" })).toBe(
      "INTEGER REFERENCES customer(id)"
    );
  });

  test("multiple modifiers", () => {
    expect(
      sqlType({
        ...baseCol,
        type: "text",
        required: true,
        unique: true,
      })
    ).toBe("TEXT NOT NULL UNIQUE");
  });

  test("all modifiers combined (except pk)", () => {
    expect(
      sqlType({
        type: "integer",
        pk: false,
        auto: false,
        required: true,
        unique: true,
        default: "0",
        references: "other(id)",
      })
    ).toBe("INTEGER NOT NULL UNIQUE DEFAULT 0 REFERENCES other(id)");
  });
});

// ============================================================================
// genSQL
// ============================================================================

describe("genSQL", () => {
  test("empty schema", () => {
    expect(genSQL({})).toBe("\n");
  });

  test("single table single column", () => {
    const schema: Schema = {
      test: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
    };
    expect(genSQL(schema)).toBe(
      "CREATE TABLE IF NOT EXISTS test (\n    id INTEGER PRIMARY KEY AUTOINCREMENT\n);\n"
    );
  });

  test("single table multiple columns", () => {
    const schema: Schema = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        email: { type: "text", pk: false, auto: false, required: false, unique: true, default: null, references: null },
      },
    };
    const sql = genSQL(schema);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS customer");
    expect(sql).toContain("id INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(sql).toContain("name TEXT NOT NULL");
    expect(sql).toContain("email TEXT UNIQUE");
  });

  test("multiple tables", () => {
    const schema: Schema = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      order: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        customer_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "customer(id)" },
      },
    };
    const sql = genSQL(schema);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS customer");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS [order]");  // order is reserved word
    expect(sql).toContain("customer_id INTEGER NOT NULL REFERENCES customer(id)");
  });

  test("default values are preserved", () => {
    const schema: Schema = {
      audit: {
        created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
        status: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'pending'", references: null },
      },
    };
    const sql = genSQL(schema);
    expect(sql).toContain("created_at TEXT DEFAULT CURRENT_TIMESTAMP");
    expect(sql).toContain("status TEXT DEFAULT 'pending'");
  });
});

// ============================================================================
// genRowInterface
// ============================================================================

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

// ============================================================================
// genInputInterface
// ============================================================================

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
    // Fields with defaults are not required
    const result = genInputInterface("defaults", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
      status: { ...baseCol, default: "'pending'" },
      created_at: { ...baseCol, default: "CURRENT_TIMESTAMP" },
    });
    expect(result).toContain("status?: string;");
    expect(result).toContain("created_at?: string;");
  });
});

// ============================================================================
// genTypes (full output)
// ============================================================================

describe("genTypes", () => {
  test("empty schema", () => {
    const result = genTypes({});
    expect(result).toBe("// Generated by schema/codegen.ts — do not edit\n\n");
  });

  test("single table generates both interfaces", () => {
    const schema: Schema = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      },
    };
    const result = genTypes(schema);
    expect(result).toContain("export interface Customer {");
    expect(result).toContain("export interface CustomerInput {");
    expect(result).toContain("// Generated by schema/codegen.ts");
  });

  test("multiple tables", () => {
    const schema: Schema = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      order: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
    };
    const result = genTypes(schema);
    expect(result).toContain("export interface Customer {");
    expect(result).toContain("export interface CustomerInput {");
    expect(result).toContain("export interface Order {");
    expect(result).toContain("export interface OrderInput {");
  });

  test("full realistic schema", () => {
    const schema: Schema = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        email: { type: "text", pk: false, auto: false, required: false, unique: true, default: null, references: null },
        phone: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
        created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
      },
    };
    const result = genTypes(schema);

    // Row interface
    expect(result).toContain("id: number;");
    expect(result).toContain("name: string;");
    expect(result).toContain("email: string | null;");
    expect(result).toContain("phone: string | null;");
    expect(result).toContain("created_at: string | null;");

    // Input interface - no id, required name, optional others
    expect(result).toMatch(/export interface CustomerInput \{[^}]*name: string;/);
    expect(result).toMatch(/export interface CustomerInput \{[^}]*email\?: string;/);
  });
});

// ============================================================================
// Integration: SQL + Types consistency
// ============================================================================

describe("integration: SQL and Types consistency", () => {
  test("same schema produces matching SQL and types", () => {
    const schema: Schema = {
      ticket: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        performance_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "performance(id)" },
        customer_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "customer(id)" },
        seat: { type: "text", pk: false, auto: false, required: false, unique: false, default: null, references: null },
        price_pence: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        status: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'reserved'", references: null },
      },
    };

    const sql = genSQL(schema);
    const types = genTypes(schema);

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

// ============================================================================
// Edge cases
// ============================================================================

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

  test("reserved word as table name is quoted", () => {
    const sql = genSQL({
      order: {
        id: { ...baseCol, type: "integer", pk: true, auto: true },
      },
    });
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS [order]");
  });

  test("input interface with only auto pk has empty body", () => {
    const result = genInputInterface("id_only", {
      id: { ...baseCol, type: "integer", pk: true, auto: true },
    });
    expect(result).toBe(`export interface IdOnlyInput {

}`);
  });
});
