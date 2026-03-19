import { describe, expect, test } from "bun:test";
import { sqlType, genSQL } from "./sql";
import type { Column } from "./types";
import type { Tables } from "./types";

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

describe("genSQL", () => {
  test("empty schema", () => {
    expect(genSQL({})).toBe("\n");
  });

  test("single table single column", () => {
    const tables: Tables = {
      test: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
    };
    expect(genSQL(tables)).toBe(
      "CREATE TABLE IF NOT EXISTS test (\n    id INTEGER PRIMARY KEY AUTOINCREMENT\n);\n"
    );
  });

  test("single table multiple columns", () => {
    const tables: Tables = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        name: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
        email: { type: "text", pk: false, auto: false, required: false, unique: true, default: null, references: null },
      },
    };
    const sql = genSQL(tables);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS customer");
    expect(sql).toContain("id INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(sql).toContain("name TEXT NOT NULL");
    expect(sql).toContain("email TEXT UNIQUE");
  });

  test("multiple tables", () => {
    const tables: Tables = {
      customer: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
      order: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
        customer_id: { type: "integer", pk: false, auto: false, required: true, unique: false, default: null, references: "customer(id)" },
      },
    };
    const sql = genSQL(tables);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS customer");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS [order]");
    expect(sql).toContain("customer_id INTEGER NOT NULL REFERENCES customer(id)");
  });

  test("default values are preserved", () => {
    const tables: Tables = {
      audit: {
        created_at: { type: "text", pk: false, auto: false, required: false, unique: false, default: "CURRENT_TIMESTAMP", references: null },
        status: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'pending'", references: null },
      },
    };
    const sql = genSQL(tables);
    expect(sql).toContain("created_at TEXT DEFAULT CURRENT_TIMESTAMP");
    expect(sql).toContain("status TEXT DEFAULT 'pending'");
  });

  test("reserved word as table name is quoted", () => {
    const tables: Tables = {
      order: {
        id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      },
    };
    const sql = genSQL(tables);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS [order]");
  });
});
