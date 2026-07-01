import assert from "assert/strict";
import type { Column, Indexes, Tables } from "./types";
import { quoteReserved } from "./utils";

export function sqlType(col: Column, availableTables?: string[]): string {
  const parts = [col.type.toUpperCase()];
  if (col.pk) parts.push("PRIMARY KEY");
  if (col.auto) parts.push("AUTOINCREMENT");
  if (col.required && !col.pk) parts.push("NOT NULL");
  if (col.unique) parts.push("UNIQUE");
  if (col.default !== null) parts.push(`DEFAULT ${col.default}`);
  if (col.references !== null) {
    // Validate that referenced table exists
    const match = col.references.match(/^(\w+)\(/);
    const targetTable = match?.[1];
    assert(
      !availableTables || !targetTable || availableTables.includes(targetTable),
      `Foreign key reference to non-existent table: ${col.references}\n` +
      `Available tables: ${availableTables?.join(", ")}\n` +
      `Either include the referenced table's module or remove the foreign key.`
    );
    // Quote table name in references if reserved
    const ref = col.references.replace(/^(\w+)/, (_, table) => quoteReserved(table));
    parts.push(`REFERENCES ${ref}`);
  }
  return parts.join(" ");
}

export function inferPerformanceIndexes(tables: Tables, explicitIndexes: Indexes = {}): Indexes {
  const inferred: Indexes = {};
  for (const [table, cols] of Object.entries(tables)) {
    const existing = explicitIndexes[table] || {};
    const names = new Set(Object.keys(existing));
    const signatures = new Set(Object.values(existing).map((index) => index.columns.join("\0")));
    const hasStatus = Boolean(cols.status);
    const temporalField = firstExistingField(cols, ["starts_at", "start_at", "scheduled_at", "date"]);
    const facetField = firstExistingField(cols, ["kind", "category"]);
    const foreignKeys = Object.entries(cols)
      .filter(([, col]) => col.references && !col.pk && !col.unique)
      .map(([field]) => field);

    if (hasStatus && foreignKeys.length === 0) {
      addInferredIndex(inferred, table, names, signatures, "by_status", ["status"]);
    }

    for (const field of foreignKeys) {
      const base = field.replace(/_id$/, "");
      if (temporalField) {
        addInferredIndex(inferred, table, names, signatures, `by_${base}_${temporalIndexSuffix(temporalField)}`, [field, temporalField]);
      } else if (facetField) {
        addInferredIndex(inferred, table, names, signatures, `by_${base}_${facetField}${hasStatus ? "_status" : ""}`, [field, facetField, ...(hasStatus ? ["status"] : [])]);
      } else if (hasStatus) {
        addInferredIndex(inferred, table, names, signatures, `by_${base}_status`, [field, "status"]);
      } else {
        addInferredIndex(inferred, table, names, signatures, `by_${base}`, [field]);
      }
    }
  }
  return inferred;
}

function firstExistingField(cols: Record<string, Column>, fields: string[]): string | null {
  return fields.find((field) => Boolean(cols[field])) || null;
}

function temporalIndexSuffix(field: string): string {
  if (field === "date") return "date";
  return "start";
}

function addInferredIndex(
  indexes: Indexes,
  table: string,
  names: Set<string>,
  signatures: Set<string>,
  name: string,
  columns: string[],
): void {
  const signature = columns.join("\0");
  if (names.has(name) || signatures.has(signature)) return;
  indexes[table] ||= {};
  indexes[table][name] = { columns, unique: false };
  names.add(name);
  signatures.add(signature);
}

function mergeIndexes(explicitIndexes: Indexes, inferredIndexes: Indexes): Indexes {
  const merged: Indexes = { ...explicitIndexes };
  for (const [table, indexes] of Object.entries(inferredIndexes)) {
    merged[table] = { ...(merged[table] || {}), ...indexes };
  }
  return merged;
}

function genIndexSQL(tables: Tables, indexes: Indexes): string[] {
  const stmts: string[] = [];
  for (const [table, tableIndexes] of Object.entries(indexes)) {
    const cols = tables[table];
    assert(cols, `Index configured for non-existent table: ${table}`);
    for (const [name, index] of Object.entries(tableIndexes)) {
      assert(index.columns.length > 0, `Index ${name} on ${table} must include at least one column`);
      for (const column of index.columns) {
        assert(cols[column], `Index ${name} on ${table} references non-existent column: ${column}`);
      }
      const unique = index.unique ? "UNIQUE " : "";
      const tableName = quoteReserved(table);
      const indexName = `${table}_${name}`;
      stmts.push(`CREATE ${unique}INDEX IF NOT EXISTS ${quoteReserved(indexName)} ON ${tableName} (${index.columns.join(", ")});`);
    }
  }
  return stmts;
}

export function genSQL(tables: Tables, indexes: Indexes = {}): string {
  const allIndexes = mergeIndexes(indexes, inferPerformanceIndexes(tables, indexes));
  // Topological sort: tables with no FK deps first
  const tableNames = Object.keys(tables);
  const deps: Record<string, string[]> = {};
  for (const [table, cols] of Object.entries(tables)) {
    deps[table] = [];
    for (const c of Object.values(cols)) {
      if (c.references) {
        const match = c.references.match(/^(\w+)\(/);
        if (match && match[1] !== table && tableNames.includes(match[1])) {
          deps[table].push(match[1]);
        }
      }
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  function visit(t: string) {
    if (visited.has(t) || !tables[t]) return;
    visited.add(t);
    for (const d of deps[t] || []) visit(d);
    sorted.push(t);
  }
  for (const t of tableNames) visit(t);

  const stmts: string[] = [];
  for (const table of sorted) {
    const cols = tables[table];
    if (!cols) continue;
    const defs: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      defs.push(`    ${col} ${sqlType(c, tableNames)}`);
    }
    const tableName = quoteReserved(table);
    stmts.push(`CREATE TABLE IF NOT EXISTS ${tableName} (\n${defs.join(",\n")}\n);`);
  }
  stmts.push(...genIndexSQL(tables, allIndexes));
  return stmts.join("\n\n") + "\n";
}
