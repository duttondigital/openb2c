import type { Column, Schema, SeedRows, SeedValue, Tables } from "./types";
import { quoteReserved } from "./utils";

export type SeedKind = "reference" | "fixtures";

export function hasSeedRows(schema: Schema, kind?: SeedKind): boolean {
  if (kind) return Object.values(schema.seed?.[kind] || {}).some(rows => rows.length > 0);
  return hasSeedRows(schema, "reference") || hasSeedRows(schema, "fixtures");
}

export function genSeedSQL(schema: Schema, kind: SeedKind): string {
  const seed = schema.seed?.[kind] || {};
  const stmts: string[] = [];
  for (const table of sortedSeedTables(schema.tables, seed)) {
    const rows = seed[table] || [];
    const columns = schema.tables[table];
    if (!columns) continue;
    for (const row of rows) {
      stmts.push(genSeedInsert(table, columns, row, kind));
    }
  }
  return stmts.length ? stmts.join("\n") + "\n" : "";
}

function sortedSeedTables(tables: Tables, seed: Record<string, SeedRows>): string[] {
  const requested = new Set(Object.keys(seed));
  const deps: Record<string, string[]> = {};
  for (const table of requested) {
    deps[table] = [];
    const cols = tables[table];
    if (!cols) continue;
    for (const col of Object.values(cols)) {
      if (!col.references) continue;
      const match = col.references.match(/^(\w+)\(/);
      if (match && match[1] !== table && requested.has(match[1])) {
        deps[table].push(match[1]);
      }
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  function visit(table: string) {
    if (visited.has(table)) return;
    visited.add(table);
    for (const dep of deps[table] || []) visit(dep);
    sorted.push(table);
  }
  for (const table of Object.keys(seed)) visit(table);
  return sorted;
}

function hasOwn(row: Record<string, SeedValue>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function conflictColumns(columns: Record<string, Column>, row: Record<string, SeedValue>): string[] {
  const primaryKey = Object.entries(columns)
    .filter(([field, column]) => column.pk && hasOwn(row, field))
    .map(([field]) => field);
  if (primaryKey.length > 0) return primaryKey;

  const unique = Object.entries(columns)
    .find(([field, column]) => column.unique && hasOwn(row, field));
  return unique ? [unique[0]] : [];
}

function genSeedInsert(table: string, tableColumns: Record<string, Column>, row: Record<string, SeedValue>, kind: SeedKind): string {
  const columns = Object.keys(tableColumns).filter(field => hasOwn(row, field));
  const columnSql = columns.map(quoteReserved).join(", ");
  const valueSql = columns.map(field => sqlLiteral(row[field])).join(", ");
  const tableName = quoteReserved(table);

  if (kind === "fixtures") {
    return `INSERT OR IGNORE INTO ${tableName} (${columnSql}) VALUES (${valueSql});`;
  }

  const conflict = conflictColumns(tableColumns, row);
  if (conflict.length === 0) {
    return `INSERT OR IGNORE INTO ${tableName} (${columnSql}) VALUES (${valueSql});`;
  }

  const updateColumns = columns.filter(field => !conflict.includes(field));
  const conflictSql = conflict.map(quoteReserved).join(", ");
  if (updateColumns.length === 0) {
    return `INSERT INTO ${tableName} (${columnSql}) VALUES (${valueSql}) ON CONFLICT (${conflictSql}) DO NOTHING;`;
  }

  const setSql = updateColumns
    .map(field => `${quoteReserved(field)} = excluded.${quoteReserved(field)}`)
    .join(", ");
  return `INSERT INTO ${tableName} (${columnSql}) VALUES (${valueSql}) ON CONFLICT (${conflictSql}) DO UPDATE SET ${setSql};`;
}

function sqlLiteral(value: SeedValue): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot seed non-finite numeric value ${value}`);
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}
