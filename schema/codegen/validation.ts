import type { Cascade, Column, Expr, FieldRef, Operation, Schema, SeedValue, Tables } from "./types";

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
    derived: schema.derived || {},
    audit: schema.audit || { entities: {} },
    seed: schema.seed || { reference: {}, fixtures: {}, applyFixturesByDefault: false },
    integrations: schema.integrations,
    operations: schema.operations || {},
    indexes: schema.indexes || {},
    validations: schema.validations || {},
    workflows: schema.workflows || { groups: {} },
  } as Schema;

  if (!schema.tables) add(diagnostics, "tables", "is required");
  if (!schema.operations) add(diagnostics, "operations", "is required");

  validateColumns(normalized, diagnostics);
  validateDerivedFields(normalized, diagnostics);
  validateAudit(normalized, diagnostics);
  validateSeed(normalized, diagnostics);
  validateIntegrations(normalized, diagnostics);
  validateIndexes(normalized, diagnostics);
  validateRelationships(normalized, diagnostics);
  validateCrossFieldValidations(normalized, diagnostics);
  validateWorkflows(normalized, diagnostics);
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

function validateColumns(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  const tables = schema.tables;
  for (const [table, cols] of Object.entries(tables)) {
    for (const [field, col] of Object.entries(cols)) {
      if (col.auto && !col.pk) {
        add(diagnostics, `tables.${table}.${field}.auto`, "auto columns must also be primary keys");
      }
      if (col.references) {
        validateReference(tables, col.references, `tables.${table}.${field}.references`, diagnostics);
      }
      validateColumnMetadata(table, field, col, diagnostics);
      validateColumnRules(table, field, col, diagnostics);
      validateColumnRelationship(schema, table, field, col, diagnostics);
    }
  }
}

function validateDerivedFields(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [entity, fields] of Object.entries(schema.derived || {})) {
    if (!tableExists(schema.tables, entity)) {
      add(diagnostics, `derived.${entity}`, `references unknown entity ${JSON.stringify(entity)}`);
      continue;
    }
    for (const [name, field] of Object.entries(fields)) {
      const path = `derived.${entity}.${name}`;
      if (columnExists(schema.tables, entity, name)) {
        add(diagnostics, path, `conflicts with stored field ${entity}.${name}`);
      }
      for (const [index, dependency] of (field.dependencies || []).entries()) {
        validateFieldRef(schema, dependency, `${path}.dependencies.${index}`, diagnostics, entity);
      }
      if (field.template && field.expression) {
        add(diagnostics, path, "must use either template or expression, not both");
      }
      if (!field.template && !field.expression) {
        add(diagnostics, path, "requires template or expression");
      }
      const dependencyFields = new Set((field.dependencies || []).filter(dependency => dependency.table === entity).map(dependency => dependency.field));
      for (const placeholder of templateFields(field.template)) {
        if (!columnExists(schema.tables, entity, placeholder)) {
          add(diagnostics, `${path}.template`, `references unknown field ${entity}.${placeholder}`);
        } else if (!dependencyFields.has(placeholder)) {
          add(diagnostics, `${path}.dependencies`, `must include template field ${entity}.${placeholder}`);
        }
      }
      if (field.expression) {
        validateConstraintExpr(schema, entity, field.expression, `${path}.expression`, diagnostics);
        for (const expressionField of expressionFields(field.expression)) {
          if (!dependencyFields.has(expressionField)) {
            add(diagnostics, `${path}.dependencies`, `must include expression field ${entity}.${expressionField}`);
          }
        }
      }
    }
  }
}

function templateFields(template: string | null | undefined): string[] {
  if (!template) return [];
  return [...template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
}

function validateColumnMetadata(table: string, field: string, col: Column, diagnostics: SchemaDiagnostic[]): void {
  const metadata = col.metadata;
  if (!metadata) return;
  if (metadata.privacy && !["public", "internal", "sensitive", "secret"].includes(metadata.privacy)) {
    add(diagnostics, `tables.${table}.${field}.metadata.privacy`, "must be one of public, internal, sensitive, or secret");
  }
}

function validateColumnRules(table: string, field: string, col: Column, diagnostics: SchemaDiagnostic[]): void {
  const validation = col.validation;
  if (!validation) return;

  if (
    validation.minLength !== null &&
    validation.minLength !== undefined &&
    validation.minLength < 0
  ) {
    add(diagnostics, `tables.${table}.${field}.validation.minLength`, "must be greater than or equal to 0");
  }

  if (
    validation.maxLength !== null &&
    validation.maxLength !== undefined &&
    validation.maxLength < 0
  ) {
    add(diagnostics, `tables.${table}.${field}.validation.maxLength`, "must be greater than or equal to 0");
  }

  if (
    validation.minLength !== null &&
    validation.minLength !== undefined &&
    validation.maxLength !== null &&
    validation.maxLength !== undefined &&
    validation.minLength > validation.maxLength
  ) {
    add(diagnostics, `tables.${table}.${field}.validation`, "minLength must be less than or equal to maxLength");
  }

  if (
    validation.minimum !== null &&
    validation.minimum !== undefined &&
    validation.maximum !== null &&
    validation.maximum !== undefined &&
    validation.minimum > validation.maximum
  ) {
    add(diagnostics, `tables.${table}.${field}.validation`, "minimum must be less than or equal to maximum");
  }

  if (validation.pattern) {
    try {
      new RegExp(validation.pattern);
    } catch {
      add(diagnostics, `tables.${table}.${field}.validation.pattern`, "must be a valid JavaScript regular expression");
    }
  }

  if ((col.type === "integer" || col.type === "real" || col.type === "float" || col.type === "number") && validation.enum?.length) {
    for (const value of validation.enum) {
      if (!Number.isFinite(Number(value))) {
        add(diagnostics, `tables.${table}.${field}.validation.enum`, `contains non-numeric value ${JSON.stringify(value)} for numeric field`);
      }
    }
  }
}

function validateColumnRelationship(schema: Schema, table: string, field: string, col: Column, diagnostics: SchemaDiagnostic[]): void {
  const relationship = col.relationship;
  if (!relationship) return;
  if (!col.references) {
    add(diagnostics, `tables.${table}.${field}.relationship`, "requires a foreign-key references value");
    return;
  }

  const parsed = parseReference(col.references);
  if (!parsed) return;
  if (relationship.cardinality && !["one", "many"].includes(relationship.cardinality)) {
    add(diagnostics, `tables.${table}.${field}.relationship.cardinality`, "must be one of one or many");
  }
  if (relationship.targetLabel) {
    validateFieldRef(schema, relationship.targetLabel, `tables.${table}.${field}.relationship.targetLabel`, diagnostics, parsed.table);
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

function validateCrossFieldValidations(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [entity, constraints] of Object.entries(schema.validations || {})) {
    if (!tableExists(schema.tables, entity)) {
      add(diagnostics, `validations.${entity}`, `references unknown entity ${JSON.stringify(entity)}`);
      continue;
    }
    for (const [name, constraint] of Object.entries(constraints)) {
      const path = `validations.${entity}.${name}`;
      if (!constraint.fields || constraint.fields.length < 2) {
        add(diagnostics, `${path}.fields`, "must include at least two fields");
      }
      for (const [index, field] of (constraint.fields || []).entries()) {
        validateFieldRef(schema, field, `${path}.fields.${index}`, diagnostics, entity);
      }
      if (!constraint.message) {
        add(diagnostics, `${path}.message`, "is required");
      }
      validateConstraintExpr(schema, entity, constraint.expression, `${path}.expression`, diagnostics);
      const declaredFields = new Set((constraint.fields || []).filter(field => field.table === entity).map(field => field.field));
      for (const field of expressionFields(constraint.expression)) {
        if (!declaredFields.has(field)) {
          add(diagnostics, `${path}.fields`, `must include expression field ${entity}.${field}`);
        }
      }
    }
  }
}

function validateAudit(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  const crud = new Set(["read", "create", "update", "delete"]);
  for (const [entity, audit] of Object.entries(schema.audit?.entities || {})) {
    if (!tableExists(schema.tables, entity)) {
      add(diagnostics, `audit.entities.${entity}`, `references unknown entity ${JSON.stringify(entity)}`);
      continue;
    }
    if (audit.category && !["data", "workflow", "security", "payment", "system"].includes(audit.category)) {
      add(diagnostics, `audit.entities.${entity}.category`, "must be one of data, workflow, security, payment, or system");
    }
    for (const [index, operation] of (audit.operations || []).entries()) {
      if (!crud.has(operation) && !schema.operations?.[entity]?.[operation]) {
        add(diagnostics, `audit.entities.${entity}.operations.${index}`, `references unknown operation ${entity}.${operation}`);
      }
    }
  }
}

function validateSeed(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const kind of ["reference", "fixtures"] as const) {
    for (const [table, rows] of Object.entries(schema.seed?.[kind] || {})) {
      if (!tableExists(schema.tables, table)) {
        add(diagnostics, `seed.${kind}.${table}`, `references unknown table ${JSON.stringify(table)}`);
        continue;
      }

      const columns = schema.tables[table];
      rows.forEach((row, index) => {
        const path = `seed.${kind}.${table}.${index}`;
        const fields = Object.keys(row);
        if (fields.length === 0) {
          add(diagnostics, path, "must include at least one field");
        }

        for (const [field, value] of Object.entries(row)) {
          const column = columns[field];
          if (!column) {
            add(diagnostics, `${path}.${field}`, `references unknown field ${table}.${field}`);
            continue;
          }
          validateSeedValue(column, value, `${path}.${field}`, diagnostics);
        }

        for (const [field, column] of Object.entries(columns)) {
          if (column.required && column.default === null && !column.auto && !hasOwn(row, field)) {
            add(diagnostics, path, `missing required field ${table}.${field}`);
          }
        }

        if (seedConflictColumns(columns, row).length === 0) {
          add(diagnostics, path, "must include a primary-key or unique field so seeding remains idempotent");
        }
      });
    }
  }
}

function hasOwn(row: Record<string, SeedValue>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function seedConflictColumns(columns: Record<string, Column>, row: Record<string, SeedValue>): string[] {
  const primaryKey = Object.entries(columns)
    .filter(([field, column]) => column.pk && hasOwn(row, field))
    .map(([field]) => field);
  if (primaryKey.length > 0) return primaryKey;

  const unique = Object.entries(columns)
    .find(([field, column]) => column.unique && hasOwn(row, field));
  return unique ? [unique[0]] : [];
}

function validateSeedValue(column: Column, value: SeedValue, path: string, diagnostics: SchemaDiagnostic[]): void {
  if (value === null) {
    if (column.required) add(diagnostics, path, "cannot be null for a required field");
    return;
  }

  const type = column.type.toLowerCase();
  if (type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) add(diagnostics, path, "must be an integer");
    return;
  }
  if (type === "real") {
    if (typeof value !== "number" || !Number.isFinite(value)) add(diagnostics, path, "must be a finite number");
    return;
  }
  if (type === "text") {
    if (typeof value !== "string") add(diagnostics, path, "must be a string");
    return;
  }
  if (type === "blob" && typeof value !== "string") {
    add(diagnostics, path, "must be a string");
  }
}

function validateIntegrations(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [name, integration] of Object.entries(schema.integrations || {})) {
    const path = `integrations.${name}`;
    if (!integration.provider) {
      add(diagnostics, `${path}.provider`, "is required");
    }
    for (const [envName, env] of Object.entries(integration.env || {})) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(envName)) {
        add(diagnostics, `${path}.env.${envName}`, "must be an uppercase environment variable name");
      }
      if (!env.description) {
        add(diagnostics, `${path}.env.${envName}.description`, "is required");
      }
    }
  }

  const signing = schema.integrations?.webhookEffects?.signing;
  if (!signing) return;
  if (signing.enabled && signing.algorithm !== "sha256") {
    add(diagnostics, "integrations.webhookEffects.signing.algorithm", "must be sha256");
  }
  if (signing.enabled && signing.payload !== "timestamp.body") {
    add(diagnostics, "integrations.webhookEffects.signing.payload", "must be timestamp.body");
  }
  if (!signing.signatureHeader) {
    add(diagnostics, "integrations.webhookEffects.signing.signatureHeader", "is required");
  }
  if (!signing.timestampHeader) {
    add(diagnostics, "integrations.webhookEffects.signing.timestampHeader", "is required");
  }
  if (signing.toleranceSeconds < 1) {
    add(diagnostics, "integrations.webhookEffects.signing.toleranceSeconds", "must be at least 1");
  }
}

function validateWorkflows(schema: Schema, diagnostics: SchemaDiagnostic[]): void {
  for (const [name, group] of Object.entries(schema.workflows?.groups || {})) {
    if (!group.label) {
      add(diagnostics, `workflows.groups.${name}.label`, "is required");
    }
    if (
      group.displayPriority !== null &&
      group.displayPriority !== undefined &&
      !Number.isFinite(group.displayPriority)
    ) {
      add(diagnostics, `workflows.groups.${name}.displayPriority`, "must be a finite number");
    }
  }
}

function expressionFields(expr: Expr | null | undefined): string[] {
  const fields = new Set<string>();
  function walk(e: Expr | null | undefined): void {
    if (!e) return;
    switch (e._t) {
      case "field":
        fields.add(String(e.name || ""));
        return;
      case "bin":
        walk(e.left as Expr);
        walk(e.right as Expr);
        return;
      case "un":
        walk(e.arg as Expr);
        return;
      default:
        return;
    }
  }
  walk(expr);
  return [...fields].filter(Boolean);
}

function validateConstraintExpr(schema: Schema, entity: string, expr: Expr | null | undefined, path: string, diagnostics: SchemaDiagnostic[]): void {
  if (!expr) {
    add(diagnostics, path, "is required");
    return;
  }
  switch (expr._t) {
    case "field": {
      const name = String(expr.name || "");
      if (!columnExists(schema.tables, entity, name)) {
        add(diagnostics, `${path}.name`, `references unknown field ${entity}.${name}`);
      }
      return;
    }
    case "lit":
      return;
    case "bin":
      validateConstraintExpr(schema, entity, expr.left as Expr, `${path}.left`, diagnostics);
      validateConstraintExpr(schema, entity, expr.right as Expr, `${path}.right`, diagnostics);
      return;
    case "un":
      validateConstraintExpr(schema, entity, expr.arg as Expr, `${path}.arg`, diagnostics);
      return;
    case "rel":
      add(diagnostics, path, "cross-field validation expressions cannot reference related records");
      return;
    case "agg":
      add(diagnostics, path, "cross-field validation expressions cannot use aggregate expressions");
      return;
    default:
      add(diagnostics, path, `has unsupported expression type ${(expr as { _t?: unknown })._t}`);
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
  validateOperationPolicy(operation, `${path}.policy`, diagnostics);
  validateOperationWorkflow(schema, entity, operation, `${path}.workflow`, diagnostics);
  validateOperationAudit(operation, `${path}.audit`, diagnostics);
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

function validateOperationAudit(operation: Operation, path: string, diagnostics: SchemaDiagnostic[]): void {
  const audit = operation.audit;
  if (!audit) return;
  if (audit.category && !["data", "workflow", "security", "payment", "system"].includes(audit.category)) {
    add(diagnostics, `${path}.category`, "must be one of data, workflow, security, payment, or system");
  }
}

function validateOperationWorkflow(schema: Schema, entity: string, operation: Operation, path: string, diagnostics: SchemaDiagnostic[]): void {
  const workflow = operation.workflow;
  if (!workflow) return;

  if (workflow.group && !schema.workflows?.groups?.[workflow.group]) {
    add(diagnostics, `${path}.group`, `references unknown workflow group ${JSON.stringify(workflow.group)}`);
  }

  for (const [index, transition] of (workflow.transitions || []).entries()) {
    const transitionPath = `${path}.transitions.${index}`;
    validateFieldRef(schema, transition.field, `${transitionPath}.field`, diagnostics, entity);
    if (!transition.from || transition.from.length === 0) {
      add(diagnostics, `${transitionPath}.from`, "must include at least one source value");
    }
    if (!transition.to) {
      add(diagnostics, `${transitionPath}.to`, "is required");
    }
    const fieldName = transition.field?.field;
    if (fieldName && operation.set && fieldName in operation.set && operation.set[fieldName] !== transition.to) {
      add(diagnostics, `${transitionPath}.to`, `does not match operation set value ${JSON.stringify(operation.set[fieldName])}`);
    } else if (fieldName && operation.set && !(fieldName in operation.set)) {
      add(diagnostics, `${transitionPath}.field`, `must be set by the operation`);
    }
  }

  if (workflow.confirmation?.severity && !["info", "warning", "danger"].includes(workflow.confirmation.severity)) {
    add(diagnostics, `${path}.confirmation.severity`, "must be one of info, warning, or danger");
  }
}

function validateOperationPolicy(operation: Operation, path: string, diagnostics: SchemaDiagnostic[]): void {
  const policy = operation.policy;
  if (!policy) return;
  for (const [index, audience] of (policy.audiences || []).entries()) {
    if (!["anonymous", "customer", "staff", "service", "system"].includes(audience)) {
      add(diagnostics, `${path}.audiences.${index}`, "must be one of anonymous, customer, staff, service, or system");
    }
  }
  if (policy.risk && !["low", "medium", "high"].includes(policy.risk)) {
    add(diagnostics, `${path}.risk`, "must be one of low, medium, or high");
  }
  if (operation.public && policy.audiences?.length && !policy.audiences.includes("anonymous")) {
    add(diagnostics, `${path}.audiences`, "public operations should include anonymous when audiences are set explicitly");
  }
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
