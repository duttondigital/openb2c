import type { Cascade, Expr, FieldRef, Operation, Schema, Tables } from "./types";

export interface SchemaDiagnostic {
  path: string;
  message: string;
}

export class SchemaValidationError extends Error {
  diagnostics: SchemaDiagnostic[];

  constructor(diagnostics: SchemaDiagnostic[]) {
    super(formatSchemaDiagnostics(diagnostics));
    this.name = "SchemaValidationError";
    this.diagnostics = diagnostics;
  }
}

export function formatSchemaDiagnostics(diagnostics: SchemaDiagnostic[]): string {
  return [
    "Schema validation failed:",
    ...diagnostics.map(diagnostic => `- ${diagnostic.path}: ${diagnostic.message}`),
  ].join("\n");
}

export function assertValidSchema(schema: Schema): void {
  const diagnostics = validateSchema(schema);
  if (diagnostics.length > 0) {
    throw new SchemaValidationError(diagnostics);
  }
}

export function validateSchema(schema: Schema): SchemaDiagnostic[] {
  const diagnostics: SchemaDiagnostic[] = [];
  const tables = schema.tables || {};
  const normalized = {
    ...schema,
    tables,
    operations: schema.operations || {},
    indexes: schema.indexes || {},
  } as Schema;

  if (!schema.tables) add(diagnostics, "tables", "is required");
  if (!schema.operations) add(diagnostics, "operations", "is required");

  validateColumns(tables, diagnostics);
  validateIndexes(normalized, diagnostics);
  validateRelationships(normalized, diagnostics);
  validateOperations(normalized, diagnostics);
  validateEcommerce(normalized, diagnostics);

  return diagnostics;
}

function add(diagnostics: SchemaDiagnostic[], path: string, message: string): void {
  diagnostics.push({ path, message });
}

function tableExists(tables: Tables, table: string): boolean {
  return Boolean(tables[table]);
}

function columnExists(tables: Tables, table: string, field: string): boolean {
  return Boolean(tables[table]?.[field]);
}

function parseReference(reference: string): { table: string; field: string } | null {
  const fk = reference.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([A-Za-z_][A-Za-z0-9_]*)\)$/);
  if (fk) return { table: fk[1], field: fk[2] };
  const dotted = reference.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dotted) return { table: dotted[1], field: dotted[2] };
  return null;
}

function validateReference(tables: Tables, reference: string, path: string, diagnostics: SchemaDiagnostic[]): void {
  const parsed = parseReference(reference);
  if (!parsed) {
    add(diagnostics, path, `must use table(field) or table.field syntax, got ${JSON.stringify(reference)}`);
    return;
  }
  if (!tableExists(tables, parsed.table)) {
    add(diagnostics, path, `references unknown table ${JSON.stringify(parsed.table)}`);
    return;
  }
  if (!columnExists(tables, parsed.table, parsed.field)) {
    add(diagnostics, path, `references unknown field ${parsed.table}.${parsed.field}`);
  }
}

function validateFieldRef(schema: Schema, ref: FieldRef | null | undefined, path: string, diagnostics: SchemaDiagnostic[], expectedTable?: string): void {
  if (!ref) {
    add(diagnostics, path, "is required");
    return;
  }
  if (expectedTable && ref.table !== expectedTable) {
    add(diagnostics, `${path}.table`, `must be ${JSON.stringify(expectedTable)}, got ${JSON.stringify(ref.table)}`);
  }
  if (!tableExists(schema.tables, ref.table)) {
    add(diagnostics, `${path}.table`, `references unknown table ${JSON.stringify(ref.table)}`);
    return;
  }
  if (!columnExists(schema.tables, ref.table, ref.field)) {
    add(diagnostics, `${path}.field`, `references unknown field ${ref.table}.${ref.field}`);
  }
  if (ref.references) validateReference(schema.tables, ref.references, `${path}.references`, diagnostics);
}

function validateOptionalFieldRef(schema: Schema, ref: FieldRef | null | undefined, path: string, diagnostics: SchemaDiagnostic[], expectedTable?: string): void {
  if (ref) validateFieldRef(schema, ref, path, diagnostics, expectedTable);
}

function validateColumns(tables: Tables, diagnostics: SchemaDiagnostic[]): void {
  for (const [table, cols] of Object.entries(tables)) {
    for (const [field, col] of Object.entries(cols)) {
      if (col.auto && !col.pk) {
        add(diagnostics, `tables.${table}.${field}.auto`, "auto columns must also be primary keys");
      }
      if (col.references) {
        validateReference(tables, col.references, `tables.${table}.${field}.references`, diagnostics);
      }
    }
  }
}

function validateIndexes(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [table, indexes] of Object.entries(schema.indexes || {})) {
    if (!tableExists(schema.tables, table)) {
      add(diagnostics, `indexes.${table}`, `references unknown table ${JSON.stringify(table)}`);
      continue;
    }
    for (const [name, index] of Object.entries(indexes)) {
      if (index.columns.length === 0) {
        add(diagnostics, `indexes.${table}.${name}.columns`, "must include at least one column");
      }
      for (const column of index.columns) {
        if (!columnExists(schema.tables, table, column)) {
          add(diagnostics, `indexes.${table}.${name}.columns`, `references unknown field ${table}.${column}`);
        }
      }
    }
  }
}

function validateRelationships(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [entity, relationships] of Object.entries(schema.relationships || {})) {
    if (!tableExists(schema.tables, entity)) {
      add(diagnostics, `relationships.${entity}`, `references unknown entity ${JSON.stringify(entity)}`);
      continue;
    }
    for (const [name, relationship] of Object.entries(relationships)) {
      validateFieldRef(schema, relationship.field, `relationships.${entity}.${name}.field`, diagnostics, entity);
    }
  }
}

function validateOperations(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [entity, operations] of Object.entries(schema.operations || {})) {
    if (!tableExists(schema.tables, entity)) {
      add(diagnostics, `operations.${entity}`, `references unknown entity ${JSON.stringify(entity)}`);
      continue;
    }
    for (const [name, operation] of Object.entries(operations)) {
      validateOperation(schema, entity, name, operation, diagnostics);
    }
  }
}

function validateOperation(schema: Schema, entity: string, name: string, operation: Operation, diagnostics: SchemaDiagnostic[]): void {
  const path = `operations.${entity}.${name}`;
  for (const [field] of Object.entries(operation.set || {})) {
    if (!columnExists(schema.tables, entity, field)) {
      add(diagnostics, `${path}.set.${field}`, `references unknown field ${entity}.${field}`);
    }
  }
  for (const [index, relationship] of (operation.relationships || []).entries()) {
    validateFieldRef(schema, relationship.field, `${path}.relationships.${index}.field`, diagnostics, entity);
  }
  for (const [index, cascade] of (operation.cascade || []).entries()) {
    validateCascade(schema, entity, cascade, `${path}.cascade.${index}`, diagnostics);
  }
  validateGuard(schema, entity, operation.guard, `${path}.guard`, diagnostics);
}

function validateCascade(schema: Schema, sourceEntity: string, cascade: Cascade, path: string, diagnostics: SchemaDiagnostic[]): void {
  if (!tableExists(schema.tables, cascade.entity)) {
    add(diagnostics, `${path}.entity`, `references unknown entity ${JSON.stringify(cascade.entity)}`);
    return;
  }
  for (const [field] of Object.entries(cascade.set || {})) {
    if (!columnExists(schema.tables, cascade.entity, field)) {
      add(diagnostics, `${path}.set.${field}`, `references unknown field ${cascade.entity}.${field}`);
    }
  }
  if (!cascade.via) {
    const fallback = `${sourceEntity}_id`;
    if (!columnExists(schema.tables, cascade.entity, fallback)) {
      add(diagnostics, `${path}.via`, `is omitted, but ${cascade.entity}.${fallback} does not exist`);
    }
    return;
  }
  if (cascade.via.includes("_") && cascade.via !== `${sourceEntity}_id`) {
    if (!tableExists(schema.tables, cascade.via)) {
      add(diagnostics, `${path}.via`, `looks like a junction table but ${JSON.stringify(cascade.via)} does not exist`);
      return;
    }
    for (const field of [`${sourceEntity}_id`, `${cascade.entity}_id`]) {
      if (!columnExists(schema.tables, cascade.via, field)) {
        add(diagnostics, `${path}.via`, `junction table ${cascade.via} must include ${field}`);
      }
    }
    return;
  }
  if (!columnExists(schema.tables, cascade.entity, cascade.via)) {
    add(diagnostics, `${path}.via`, `direct cascade field ${cascade.entity}.${cascade.via} does not exist`);
  }
}

function validateGuard(schema: Schema, entity: string, expr: Expr | null, path: string, diagnostics: SchemaDiagnostic[]): void {
  if (!expr) return;
  switch (expr._t) {
    case "field": {
      const name = String(expr.name || "");
      if (!columnExists(schema.tables, entity, name)) {
        add(diagnostics, `${path}.name`, `references unknown field ${entity}.${name}`);
      }
      return;
    }
    case "rel": {
      const rel = String(expr.entity || "");
      const field = String(expr.field || "");
      if (!tableExists(schema.tables, rel)) {
        add(diagnostics, `${path}.entity`, `references unknown related entity ${JSON.stringify(rel)}`);
      } else if (!columnExists(schema.tables, rel, field)) {
        add(diagnostics, `${path}.field`, `references unknown field ${rel}.${field}`);
      }
      const fk = `${rel}_id`;
      if (!columnExists(schema.tables, entity, fk)) {
        add(diagnostics, `${path}.entity`, `requires ${entity}.${fk} so the related ${rel} row can be loaded`);
      }
      return;
    }
    case "lit":
      return;
    case "bin":
      validateGuard(schema, entity, expr.left as Expr, `${path}.left`, diagnostics);
      validateGuard(schema, entity, expr.right as Expr, `${path}.right`, diagnostics);
      return;
    case "un":
      validateGuard(schema, entity, expr.arg as Expr, `${path}.arg`, diagnostics);
      return;
    case "agg":
      add(diagnostics, path, "aggregate guard expressions are not supported by the current service generator");
      return;
    default:
      add(diagnostics, path, `has unsupported expression type ${(expr as { _t?: unknown })._t}`);
  }
}

function validateEcommerce(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  const ecommerce = schema.ecommerce;
  if (!ecommerce?.enabled) return;

  requireEntity(schema, ecommerce.catalog.entity, "ecommerce.catalog.entity", diagnostics);
  validateFieldRef(schema, ecommerce.catalog.title, "ecommerce.catalog.title", diagnostics, ecommerce.catalog.entity);
  validateOptionalFieldRef(schema, ecommerce.catalog.description, "ecommerce.catalog.description", diagnostics, ecommerce.catalog.entity);
  validateFieldRef(schema, ecommerce.catalog.price, "ecommerce.catalog.price", diagnostics, ecommerce.catalog.entity);
  ecommerce.catalog.groupBy.forEach((ref, index) => validateFieldRef(schema, ref, `ecommerce.catalog.groupBy.${index}`, diagnostics, ecommerce.catalog.entity));
  ecommerce.catalog.variantFields.forEach((ref, index) => validateFieldRef(schema, ref, `ecommerce.catalog.variantFields.${index}`, diagnostics, ecommerce.catalog.entity));
  validateOptionalFieldRef(schema, ecommerce.catalog.availability.field, "ecommerce.catalog.availability.field", diagnostics, ecommerce.catalog.entity);

  requireEntity(schema, ecommerce.order.entity, "ecommerce.order.entity", diagnostics);
  validateFieldRef(schema, ecommerce.order.user, "ecommerce.order.user", diagnostics, ecommerce.order.entity);
  validateFieldRef(schema, ecommerce.order.status, "ecommerce.order.status", diagnostics, ecommerce.order.entity);
  validateFieldRef(schema, ecommerce.order.amount, "ecommerce.order.amount", diagnostics, ecommerce.order.entity);
  validateFieldRef(schema, ecommerce.order.currency, "ecommerce.order.currency", diagnostics, ecommerce.order.entity);
  validateFieldRef(schema, ecommerce.order.expiresAt, "ecommerce.order.expiresAt", diagnostics, ecommerce.order.entity);
  validateFieldRef(schema, ecommerce.order.paymentReference, "ecommerce.order.paymentReference", diagnostics, ecommerce.order.entity);
  validateOptionalFieldRef(schema, ecommerce.order.client, "ecommerce.order.client", diagnostics, ecommerce.order.entity);

  requireEntity(schema, ecommerce.lineItem.entity, "ecommerce.lineItem.entity", diagnostics);
  validateFieldRef(schema, ecommerce.lineItem.catalogItem, "ecommerce.lineItem.catalogItem", diagnostics, ecommerce.lineItem.entity);
  validateFieldRef(schema, ecommerce.lineItem.user, "ecommerce.lineItem.user", diagnostics, ecommerce.lineItem.entity);
  validateFieldRef(schema, ecommerce.lineItem.price, "ecommerce.lineItem.price", diagnostics, ecommerce.lineItem.entity);
  validateFieldRef(schema, ecommerce.lineItem.status, "ecommerce.lineItem.status", diagnostics, ecommerce.lineItem.entity);
  validateOptionalFieldRef(schema, ecommerce.lineItem.quantity, "ecommerce.lineItem.quantity", diagnostics, ecommerce.lineItem.entity);
  for (const [name, option] of Object.entries(ecommerce.lineItem.options || {})) {
    validateOptionalFieldRef(schema, option.field, `ecommerce.lineItem.options.${name}.field`, diagnostics, ecommerce.lineItem.entity);
    if (option.min !== null && option.max !== null && option.min > option.max) {
      add(diagnostics, `ecommerce.lineItem.options.${name}`, "min must be less than or equal to max");
    }
    if (option.default !== null && option.choices.length > 0 && !option.choices.includes(option.default)) {
      add(diagnostics, `ecommerce.lineItem.options.${name}.default`, "must be one of choices when choices are configured");
    }
  }

  requireEntity(schema, ecommerce.orderLine.entity, "ecommerce.orderLine.entity", diagnostics);
  validateFieldRef(schema, ecommerce.orderLine.order, "ecommerce.orderLine.order", diagnostics, ecommerce.orderLine.entity);
  validateFieldRef(schema, ecommerce.orderLine.lineItem, "ecommerce.orderLine.lineItem", diagnostics, ecommerce.orderLine.entity);

  requireEntity(schema, ecommerce.transaction.entity, "ecommerce.transaction.entity", diagnostics);
  validateFieldRef(schema, ecommerce.transaction.user, "ecommerce.transaction.user", diagnostics, ecommerce.transaction.entity);
  validateFieldRef(schema, ecommerce.transaction.amount, "ecommerce.transaction.amount", diagnostics, ecommerce.transaction.entity);
  validateOptionalFieldRef(schema, ecommerce.transaction.type, "ecommerce.transaction.type", diagnostics, ecommerce.transaction.entity);
  validateFieldRef(schema, ecommerce.transaction.status, "ecommerce.transaction.status", diagnostics, ecommerce.transaction.entity);
  validateFieldRef(schema, ecommerce.transaction.reference, "ecommerce.transaction.reference", diagnostics, ecommerce.transaction.entity);
  validateOptionalFieldRef(schema, ecommerce.transaction.client, "ecommerce.transaction.client", diagnostics, ecommerce.transaction.entity);

  requireEntity(schema, ecommerce.transactionLine.entity, "ecommerce.transactionLine.entity", diagnostics);
  validateFieldRef(schema, ecommerce.transactionLine.transaction, "ecommerce.transactionLine.transaction", diagnostics, ecommerce.transactionLine.entity);
  validateFieldRef(schema, ecommerce.transactionLine.lineItem, "ecommerce.transactionLine.lineItem", diagnostics, ecommerce.transactionLine.entity);

  if (ecommerce.checkout.expiryMinutes < 1) add(diagnostics, "ecommerce.checkout.expiryMinutes", "must be at least 1");
  if (ecommerce.checkout.maxQuantity < 1) add(diagnostics, "ecommerce.checkout.maxQuantity", "must be at least 1");
  if (ecommerce.checkout.maxLines < 1) add(diagnostics, "ecommerce.checkout.maxLines", "must be at least 1");
}

function requireEntity(schema: Schema, entity: string, path: string, diagnostics: SchemaDiagnostic[]): void {
  if (!entity) {
    add(diagnostics, path, "is required");
  } else if (!tableExists(schema.tables, entity)) {
    add(diagnostics, path, `references unknown entity ${JSON.stringify(entity)}`);
  }
}
