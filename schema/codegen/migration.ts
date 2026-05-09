import assert from "assert/strict";
import type { Column, Indexes, Tables } from "./types";
import { sqlType } from "./sql";
import { quoteReserved } from "./utils";

export type MigrationStepKind =
  | "create_table"
  | "add_column"
  | "create_index"
  | "manual";

export interface MigrationStep {
  kind: MigrationStepKind;
  description: string;
  sql: string | null;
}

export interface MigrationPlan {
  steps: MigrationStep[];
  warnings: string[];
  rollbackGuidance: string;
  forwardFixGuidance: string;
}

function sameColumn(a: Column, b: Column): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createTableSQL(table: string, cols: Record<string, Column>, availableTables: string[]): string {
  const defs = Object.entries(cols).map(([col, c]) => `    ${col} ${sqlType(c, availableTables)}`);
  return `CREATE TABLE IF NOT EXISTS ${quoteReserved(table)} (\n${defs.join(",\n")}\n);`;
}

function createIndexSQL(table: string, name: string, index: { columns: string[]; unique: boolean }): string {
  const unique = index.unique ? "UNIQUE " : "";
  return `CREATE ${unique}INDEX IF NOT EXISTS ${quoteReserved(`${table}_${name}`)} ON ${quoteReserved(table)} (${index.columns.join(", ")});`;
}

function canAddColumnSafely(column: Column): boolean {
  if (column.pk || column.unique) return false;
  if (column.required && column.default === null) return false;
  return true;
}

function assertIndexColumns(table: string, cols: Record<string, Column>, name: string, columns: string[]) {
  assert(columns.length > 0, `Index ${name} on ${table} must include at least one column`);
  for (const column of columns) {
    assert(cols[column], `Index ${name} on ${table} references non-existent column: ${column}`);
  }
}

export function planMigration(
  oldTables: Tables,
  newTables: Tables,
  oldIndexes: Indexes = {},
  newIndexes: Indexes = {}
): MigrationPlan {
  const steps: MigrationStep[] = [];
  const warnings: string[] = [];
  const newTableNames = Object.keys(newTables);

  for (const [table, cols] of Object.entries(newTables)) {
    const oldCols = oldTables[table];
    if (!oldCols) {
      steps.push({
        kind: "create_table",
        description: `Create table ${table}`,
        sql: createTableSQL(table, cols, newTableNames),
      });
      continue;
    }

    for (const [column, col] of Object.entries(cols)) {
      const oldCol = oldCols[column];
      if (!oldCol) {
        if (canAddColumnSafely(col)) {
          steps.push({
            kind: "add_column",
            description: `Add column ${table}.${column}`,
            sql: `ALTER TABLE ${quoteReserved(table)} ADD COLUMN ${column} ${sqlType(col, newTableNames)};`,
          });
        } else {
          const warning = `Column ${table}.${column} needs a manual migration because SQLite cannot safely add it without rewriting data`;
          warnings.push(warning);
          steps.push({ kind: "manual", description: warning, sql: null });
        }
      } else if (!sameColumn(oldCol, col)) {
        const warning = `Column ${table}.${column} changed shape and needs a manual forward migration`;
        warnings.push(warning);
        steps.push({ kind: "manual", description: warning, sql: null });
      }
    }

    for (const column of Object.keys(oldCols)) {
      if (!cols[column]) {
        const warning = `Column ${table}.${column} was removed and needs a manual data-preserving migration`;
        warnings.push(warning);
        steps.push({ kind: "manual", description: warning, sql: null });
      }
    }
  }

  for (const table of Object.keys(oldTables)) {
    if (!newTables[table]) {
      const warning = `Table ${table} was removed and needs a manual archival or forward-fix migration`;
      warnings.push(warning);
      steps.push({ kind: "manual", description: warning, sql: null });
    }
  }

  for (const [table, indexes] of Object.entries(newIndexes)) {
    const cols = newTables[table];
    assert(cols, `Index configured for non-existent table: ${table}`);
    const previous = oldIndexes[table] || {};
    for (const [name, index] of Object.entries(indexes)) {
      assertIndexColumns(table, cols, name, index.columns);
      if (JSON.stringify(previous[name]) === JSON.stringify(index)) continue;
      steps.push({
        kind: "create_index",
        description: `Create ${index.unique ? "unique " : ""}index ${table}.${name}`,
        sql: createIndexSQL(table, name, index),
      });
      if (index.unique) {
        warnings.push(`Unique index ${table}.${name} will fail until duplicate rows are cleaned up`);
      }
    }
  }

  return {
    steps,
    warnings,
    rollbackGuidance: "Take a SQLite backup before applying migrations. Roll back by restoring that backup; prefer forward-fix migrations once changes have reached shared environments.",
    forwardFixGuidance: "If a migration fails after partial operator work, leave the failed SQL unchanged and add a new numbered migration that repairs data or advances the schema.",
  };
}

export function generateMigrationStub(plan: MigrationPlan): string {
  const lines = [
    "-- OpenB2C generated migration stub",
    `-- Rollback: ${plan.rollbackGuidance}`,
    `-- Forward fix: ${plan.forwardFixGuidance}`,
  ];
  for (const warning of plan.warnings) lines.push(`-- Warning: ${warning}`);
  for (const step of plan.steps) {
    lines.push("", `-- ${step.description}`);
    lines.push(step.sql || "-- TODO: write manual data-preserving SQL for this step.");
  }
  return `${lines.join("\n")}\n`;
}
