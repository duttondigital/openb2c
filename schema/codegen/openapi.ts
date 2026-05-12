import type { AuthConfig, Column, DerivedField, Operation, Schema } from "./types";
import { getAppMetadata, hasCommerceWorkflow, hasCommerceBookingAliases, openApiEcommerceMetadata, pascalCase } from "./utils";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);
const AUTH_SECURITY = [
  { bearerAuth: [] },
  { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
];
const WEBHOOK_SECURITY = [{ paymentWebhookSignature: [] }];
const DEFAULT_AUTH: AuthConfig = {
  roles: {
    customer: {
      label: "Customer",
      description: "Authenticated customer identity for self-service account and owned-resource access.",
      audience: "customer",
      defaultScopes: [],
      internal: false,
    },
    staff: {
      label: "Staff",
      description: "Authenticated staff/operator identity for administrative workflows.",
      audience: "staff",
      defaultScopes: [],
      internal: false,
    },
    service: {
      label: "Service",
      description: "User-bound API key or integration identity for service-to-service access.",
      audience: "service",
      defaultScopes: [],
      internal: false,
    },
    system: {
      label: "System",
      description: "Trusted local system execution with the explicit wildcard scope.",
      audience: "system",
      defaultScopes: ["*"],
      internal: true,
    },
  },
};

function defaultOperation(): Operation {
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, audit: {}, set: {}, cascade: [], effects: [] };
}

function operationFor(ops: Record<string, Operation>, action: string): Operation {
  return ops[action] || defaultOperation();
}

function operationScope(entity: string, action: string, op: Operation): string {
  return op.scope ?? `${entity}.${action}`;
}

function operationAudiences(op: Operation): string[] {
  if (op.policy?.audiences?.length) return op.policy.audiences;
  if (op.public) return ["anonymous", "customer", "staff", "service"];
  if (op.relationships.length > 0) return ["customer"];
  return ["staff", "service"];
}

function operationPolicy(entity: string, action: string, op: Operation): Record<string, unknown> {
  const policy = op.policy || {};
  return {
    scope: operationScope(entity, action, op),
    public: op.public,
    audiences: operationAudiences(op),
    risk: policy.risk || "medium",
    relationships: op.relationships.map(rel => ({
      table: rel.field.table,
      field: rel.field.field,
      references: rel.field.references,
    })),
    ...(policy.label ? { label: policy.label } : {}),
    ...(policy.description ? { description: policy.description } : {}),
  };
}

function withPolicy(operation: Record<string, unknown>, entity: string, action: string, op: Operation): Record<string, unknown> {
  return {
    ...operation,
    "x-openb2c-policy": operationPolicy(entity, action, op),
  };
}

function operationWorkflow(op: Operation): Record<string, unknown> | null {
  const workflow = op.workflow || {};
  const extension: Record<string, unknown> = {};
  if (workflow.group) extension.group = workflow.group;
  if (workflow.transitions?.length) {
    extension.transitions = workflow.transitions.map(transition => ({
      field: {
        table: transition.field.table,
        field: transition.field.field,
        references: transition.field.references,
      },
      from: transition.from,
      to: transition.to,
    }));
  }
  if (workflow.audit) {
    extension.audit = {
      summary: workflow.audit.summary,
      ...(workflow.audit.detail ? { detail: workflow.audit.detail } : {}),
    };
  }
  if (workflow.confirmation) {
    const confirmation = workflow.confirmation;
    if (
      confirmation.required ||
      confirmation.title ||
      confirmation.message ||
      confirmation.confirmLabel
    ) {
      extension.confirmation = {
        required: Boolean(confirmation.required),
        severity: confirmation.severity || "warning",
        ...(confirmation.title ? { title: confirmation.title } : {}),
        ...(confirmation.message ? { message: confirmation.message } : {}),
        ...(confirmation.confirmLabel ? { confirmLabel: confirmation.confirmLabel } : {}),
      };
    }
  }
  return Object.keys(extension).length > 0 ? extension : null;
}

function withWorkflow(operation: Record<string, unknown>, op: Operation): Record<string, unknown> {
  const workflow = operationWorkflow(op);
  if (!workflow) return operation;
  return {
    ...operation,
    "x-openb2c-workflow": workflow,
  };
}

function operationAudit(schema: Schema, entity: string, action: string, op: Operation): Record<string, unknown> | null {
  const entityAudit = schema.audit?.entities?.[entity];
  const explicit = op.audit || {};
  const required = Boolean(explicit.required || entityAudit?.operations?.includes(action));
  if (!required) return null;
  return {
    required: true,
    category: explicit.category || entityAudit?.category || "data",
    ...(explicit.reason || entityAudit?.reason ? { reason: explicit.reason || entityAudit?.reason } : {}),
  };
}

function withAudit(operation: Record<string, unknown>, schema: Schema, entity: string, action: string, op: Operation): Record<string, unknown> {
  const audit = operationAudit(schema, entity, action, op);
  if (!audit) return operation;
  return {
    ...operation,
    "x-openb2c-audit": audit,
  };
}

function openApiAuthMetadata(schema: Schema): Record<string, unknown> {
  const auth = {
    roles: {
      ...DEFAULT_AUTH.roles,
      ...(schema.auth?.roles || {}),
    },
  };
  const operationPolicies: Record<string, Record<string, unknown>> = {};
  for (const entity of Object.keys(schema.tables || {})) {
    const ops = schema.operations?.[entity] || {};
    operationPolicies[entity] = {};
    const actions = new Set([...CRUD_ACTIONS, ...Object.keys(ops)]);
    for (const action of actions) {
      operationPolicies[entity][action] = operationPolicy(entity, action, operationFor(ops, action));
    }
  }
  return {
    roles: auth.roles,
    operationPolicies,
  };
}

function openApiAuditMetadata(schema: Schema): Record<string, unknown> | null {
  const entities = schema.audit?.entities || {};
  const operationAuditRequirements: Record<string, Record<string, unknown>> = {};
  for (const entity of Object.keys(schema.tables || {})) {
    const ops = schema.operations?.[entity] || {};
    const actions = new Set([...CRUD_ACTIONS, ...Object.keys(ops)]);
    for (const action of actions) {
      const audit = operationAudit(schema, entity, action, operationFor(ops, action));
      if (!audit) continue;
      operationAuditRequirements[entity] ||= {};
      operationAuditRequirements[entity][action] = audit;
    }
  }
  if (Object.keys(entities).length === 0 && Object.keys(operationAuditRequirements).length === 0) return null;
  return {
    entities,
    operationAuditRequirements,
  };
}

function openApiWorkflowMetadata(schema: Schema): Record<string, unknown> | null {
  const groups = schema.workflows?.groups || {};
  const operationWorkflows: Record<string, Record<string, unknown>> = {};
  for (const entity of Object.keys(schema.tables || {})) {
    const ops = schema.operations?.[entity] || {};
    const actions = new Set([...CRUD_ACTIONS, ...Object.keys(ops)]);
    for (const action of actions) {
      const workflow = operationWorkflow(operationFor(ops, action));
      if (!workflow) continue;
      operationWorkflows[entity] ||= {};
      operationWorkflows[entity][action] = workflow;
    }
  }
  if (Object.keys(groups).length === 0 && Object.keys(operationWorkflows).length === 0) return null;
  return {
    groups,
    operationWorkflows,
  };
}

function openApiValidationMetadata(schema: Schema): Record<string, unknown> | null {
  const crossFieldConstraints: Record<string, Record<string, unknown>> = {};
  for (const [entity, constraints] of Object.entries(schema.validations || {})) {
    crossFieldConstraints[entity] = {};
    for (const [name, constraint] of Object.entries(constraints)) {
      crossFieldConstraints[entity][name] = {
        fields: constraint.fields.map(field => ({
          table: field.table,
          field: field.field,
          references: field.references,
        })),
        expression: constraint.expression,
        message: constraint.message,
      };
    }
  }
  if (Object.keys(crossFieldConstraints).length === 0) return null;
  return { crossFieldConstraints };
}

function errorResponse(description: string): unknown {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

function hasOptimisticConcurrency(cols: Record<string, Column>): boolean {
  return !!cols.updated_at;
}

function ifMatchParameter(): Record<string, unknown> {
  return {
    name: "If-Match",
    in: "header",
    required: false,
    schema: { type: "string" },
    description: "Optional optimistic concurrency token from the ETag returned by the read endpoint.",
  };
}

function withConcurrencyParameters(parameters: unknown[] | undefined, enabled: boolean): unknown[] | undefined {
  if (!enabled) return parameters;
  return [...(parameters || []), ifMatchParameter()];
}

function foundResponse(schemaRef: string, concurrency: boolean): Record<string, unknown> {
  const response: Record<string, unknown> = {
    description: "Found",
    content: { "application/json": { schema: { $ref: schemaRef } } },
  };
  if (concurrency) {
    response.headers = {
      ETag: {
        description: "Optimistic concurrency token for If-Match write checks.",
        schema: { type: "string" },
      },
    };
  }
  return response;
}

function addResponses(operation: Record<string, unknown>, responses: Record<string, unknown>): Record<string, unknown> {
  const current = { ...((operation.responses as Record<string, unknown> | undefined) || {}) };
  for (const [status, response] of Object.entries(responses)) {
    if (!(status in current)) current[status] = response;
  }
  return { ...operation, responses: current };
}

function withAuth(operation: Record<string, unknown>, isPublic = false): Record<string, unknown> {
  if (isPublic) return operation;
  return addResponses({ ...operation, security: AUTH_SECURITY }, {
    "401": errorResponse("Authentication required"),
    "403": errorResponse("Forbidden"),
  });
}

function withWebhookSignature(operation: Record<string, unknown>): Record<string, unknown> {
  return addResponses({ ...operation, security: WEBHOOK_SECURITY }, {
    "401": errorResponse("Invalid signature"),
  });
}

function commerceOptionValueSchema(option: {
  type: string;
  default: string | null;
  choices: string[];
  required: boolean;
  min: number | null;
  max: number | null;
}): Record<string, unknown> {
  const numeric = option.type === "integer" || option.type === "number" || option.type === "real";
  const integer = option.type === "integer";
  const schema: Record<string, unknown> = {
    type: integer ? "integer" : numeric ? "number" : "string",
  };
  if (option.choices.length > 0) {
    const numericChoices = option.choices.map(choice => Number(choice));
    schema.enum = numeric && numericChoices.every(Number.isFinite) ? numericChoices : option.choices;
  }
  if (numeric && option.min !== null) schema.minimum = option.min;
  if (numeric && option.max !== null) schema.maximum = option.max;
  if (option.default !== null) {
    const numericDefault = Number(option.default);
    schema.default = numeric && Number.isFinite(numericDefault) ? numericDefault : option.default;
  }
  if (!option.required) schema.nullable = true;
  return schema;
}

function commerceOptionsSchema(schema: Schema): Record<string, unknown> {
  const options = schema.ecommerce?.lineItem.options || {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, option] of Object.entries(options)) {
    properties[name] = commerceOptionValueSchema(option);
    if (option.required) required.push(name);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function columnOpenApiType(col: Column): { type: string; format?: string } {
  switch (col.type) {
    case "integer":
      return { type: "integer" };
    case "real":
    case "float":
    case "number":
      return { type: "number" };
    case "blob":
      return { type: "string", format: "binary" };
    default:
      return { type: "string" };
  }
}

function parseColumnReference(reference: string | null): { table: string; field: string } | null {
  if (!reference) return null;
  const fk = reference.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([A-Za-z_][A-Za-z0-9_]*)\)$/);
  if (fk) return { table: fk[1], field: fk[2] };
  const dotted = reference.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dotted) return { table: dotted[1], field: dotted[2] };
  return null;
}

function coerceColumnValue(value: string, col: Column): string | number | boolean {
  if (col.type === "integer" || col.type === "real" || col.type === "float" || col.type === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (col.type === "boolean") return value === "true" || value === "1";
  return value;
}

function columnFieldMetadata(col: Column): Record<string, unknown> | null {
  const metadata = col.metadata || {};
  const extension: Record<string, unknown> = {};
  if (metadata.label) extension.label = metadata.label;
  if (metadata.helpText) extension.helpText = metadata.helpText;
  if (metadata.placeholder) extension.placeholder = metadata.placeholder;
  if (metadata.format) extension.format = metadata.format;
  if (metadata.displayPriority !== null && metadata.displayPriority !== undefined) extension.displayPriority = metadata.displayPriority;
  if (metadata.privacy && metadata.privacy !== "public") extension.privacy = metadata.privacy;
  if (metadata.redact) extension.redact = true;
  return Object.keys(extension).length ? extension : null;
}

function columnRelationshipMetadata(col: Column): Record<string, unknown> | null {
  const reference = parseColumnReference(col.references);
  if (!reference) return null;

  const relationship = col.relationship || {};
  const metadata = col.metadata || {};
  const extension: Record<string, unknown> = {
    targetEntity: reference.table,
    targetField: reference.field,
    cardinality: relationship.cardinality || "one",
  };
  if (relationship.label || metadata.label) extension.label = relationship.label || metadata.label;
  if (relationship.description) extension.description = relationship.description;
  if (relationship.targetLabel) {
    extension.targetLabel = {
      entity: relationship.targetLabel.table,
      field: relationship.targetLabel.field,
    };
  }
  return extension;
}

function columnValueSchema(col: Column, options: { includeDefault?: boolean } = {}): Record<string, unknown> {
  const validation = col.validation || {};
  const metadata = col.metadata || {};
  const type = columnOpenApiType(col);
  const schema: Record<string, unknown> = { ...type };
  const isString = type.type === "string";
  const isNumeric = type.type === "integer" || type.type === "number";

  if (metadata.label) schema.title = metadata.label;
  if (metadata.helpText) schema.description = metadata.helpText;
  if (metadata.format) schema.format = metadata.format;
  if (validation.enum?.length) schema.enum = validation.enum.map(value => coerceColumnValue(value, col));
  if (isString && validation.minLength !== null && validation.minLength !== undefined) schema.minLength = validation.minLength;
  if (isString && validation.maxLength !== null && validation.maxLength !== undefined) schema.maxLength = validation.maxLength;
  if (isString && validation.pattern) schema.pattern = validation.pattern;
  if (isNumeric && validation.minimum !== null && validation.minimum !== undefined) schema.minimum = validation.minimum;
  if (isNumeric && validation.maximum !== null && validation.maximum !== undefined) schema.maximum = validation.maximum;
  if (options.includeDefault && col.default !== null) schema.default = col.default;

  const fieldMetadata = columnFieldMetadata(col);
  if (fieldMetadata) schema["x-openb2c-field"] = fieldMetadata;
  const relationshipMetadata = columnRelationshipMetadata(col);
  if (relationshipMetadata) schema["x-openb2c-relationship"] = relationshipMetadata;
  return schema;
}

function derivedValueSchema(field: DerivedField): Record<string, unknown> {
  const schema = columnValueSchema({
    type: field.type,
    pk: false,
    auto: false,
    required: true,
    unique: false,
    default: null,
    references: null,
    metadata: field.metadata || {},
  });
  schema.readOnly = true;
  schema["x-openb2c-derived"] = {
    displayOnly: true,
    dependencies: field.dependencies.map(dependency => ({
      table: dependency.table,
      field: dependency.field,
      references: dependency.references,
    })),
    ...(field.template ? { template: field.template } : {}),
    ...(field.expression ? { expression: field.expression } : {}),
  };
  return schema;
}

function operationComponentName(entityName: string, opName: string, suffix: "Input" | "Result"): string {
  return `${entityName}${pascalCase(opName)}${suffix}`;
}

function operationRequestSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {},
    additionalProperties: false,
    description: "This generated operation does not accept a request body.",
  };
}

function operationResultSchema(op: Operation): Record<string, unknown> {
  const status = op.set?.status;
  return {
    type: "object",
    properties: {
      id: { type: "integer" },
      status: status
        ? { type: "string", enum: [status] }
        : { type: "string", description: "Operation status result." },
    },
    required: ["id", "status"],
    additionalProperties: false,
  };
}

function idResultSchema(description: string): Record<string, unknown> {
  return {
    type: "object",
    description,
    properties: {
      id: { type: "integer" },
    },
    required: ["id"],
    additionalProperties: false,
  };
}

function deleteResultSchema(entity: string): Record<string, unknown> {
  return {
    type: "object",
    description: `Deletion result for ${entity}.`,
    properties: {
      deleted: { type: "boolean", enum: [true] },
    },
    required: ["deleted"],
    additionalProperties: false,
  };
}

export function genOpenAPI(schema: Schema): string {
  const app = getAppMetadata(schema);
  const auditMetadata = openApiAuditMetadata(schema);
  const workflowMetadata = openApiWorkflowMetadata(schema);
  const validationMetadata = openApiValidationMetadata(schema);
  const ecommerceMetadata = openApiEcommerceMetadata(schema);
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  // Error schema
  schemas.Error = {
    type: "object",
    properties: {
      error: { type: "string" },
      code: { type: "string", enum: ["not_found", "malformed", "invalid", "bad_state", "conflict", "internal_error", "unauthorized", "forbidden", "rate_limited", "payload_too_large", "unsupported_media_type", "timeout"] },
      details: { type: "object", additionalProperties: { type: "string" } },
    },
    required: ["error", "code"],
  };

  // Paginated response schema
  schemas.PaginatedResponse = {
    type: "object",
    properties: {
      items: { type: "array", items: {} },
      total: { type: "integer" },
      limit: { type: "integer" },
      offset: { type: "integer" },
    },
  };

  schemas.AuthContext = {
    type: "object",
    properties: {
      userId: { oneOf: [{ type: "integer" }, { type: "null" }] },
      scopes: { type: "array", items: { type: "string" } },
    },
    required: ["userId", "scopes"],
  };
  schemas.AuthRevocationResult = {
    type: "object",
    properties: {
      revoked: { type: "boolean" },
    },
    required: ["revoked"],
  };
  schemas.Certificate = {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      publicKey: { type: "string" },
      issuedAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
      signature: { type: "string" },
    },
    required: ["email", "publicKey", "issuedAt", "expiresAt", "signature"],
  };
  schemas.IdentityChallengeInput = {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      publicKey: { type: "string" },
    },
    required: ["email", "publicKey"],
    additionalProperties: false,
  };
  schemas.IdentityChallengeResult = {
    type: "object",
    properties: {
      challengeId: { type: "integer" },
      code: { type: "string", description: "Development-only verification code when NODE_ENV is not production." },
      message: { type: "string" },
    },
    required: ["challengeId"],
  };
  schemas.IdentityVerifyInput = {
    type: "object",
    properties: {
      challengeId: { type: "integer" },
      code: { type: "string" },
      signature: { type: "string" },
    },
    required: ["challengeId", "code", "signature"],
    additionalProperties: false,
  };
  schemas.IdentityVerifyResult = {
    type: "object",
    properties: {
      certificate: { $ref: "#/components/schemas/Certificate" },
      sessionToken: { type: "string" },
      sessionExpiresAt: { type: "string", format: "date-time" },
      auth: { $ref: "#/components/schemas/AuthContext" },
    },
    required: ["certificate", "sessionToken", "sessionExpiresAt", "auth"],
  };

  paths["/auth/context"] = {
    get: withAuth({
      summary: "Current authenticated context",
      responses: {
        "200": { description: "Authenticated context", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthContext" } } } },
      },
    }),
  };
  paths["/auth/revoke-current"] = {
    post: withAuth({
      summary: "Revoke the current authenticated session or certificate",
      responses: {
        "200": { description: "Current credentials revoked", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthRevocationResult" } } } },
        "404": errorResponse("Credential not found"),
      },
    }),
  };
  paths["/identity/public-key"] = {
    get: {
      summary: "Identity registry public key",
      responses: {
        "200": {
          description: "Registry public key",
          content: { "application/json": { schema: { type: "object", properties: { publicKey: { type: "string" } }, required: ["publicKey"] } } },
        },
      },
    },
  };
  paths["/identity/challenge"] = {
    post: {
      summary: "Create an email identity challenge",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IdentityChallengeInput" } } },
      },
      responses: {
        "200": { description: "Challenge created", content: { "application/json": { schema: { $ref: "#/components/schemas/IdentityChallengeResult" } } } },
        "422": errorResponse("Validation error"),
        "429": errorResponse("Rate limited"),
      },
    },
  };
  paths["/identity/verify"] = {
    post: {
      summary: "Verify an identity challenge and issue a session",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IdentityVerifyInput" } } },
      },
      responses: {
        "200": { description: "Identity verified", content: { "application/json": { schema: { $ref: "#/components/schemas/IdentityVerifyResult" } } } },
        "422": errorResponse("Verification failed"),
        "429": errorResponse("Rate limited"),
      },
    },
  };

  for (const [entity, cols] of Object.entries(schema.tables)) {
    const Entity = pascalCase(entity);
    const ops = schema.operations[entity] || {};
    const concurrency = hasOptimisticConcurrency(cols);
    const createRelationshipFields = new Set(
      (ops.create?.relationships ?? [])
        .filter(rel => rel.field.table === entity)
        .map(rel => rel.field.field)
    );

    // Entity schema
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      properties[col] = columnValueSchema(c, { includeDefault: true });
      if (c.required || c.pk) required.push(col);
    }
    for (const [field, derived] of Object.entries(schema.derived?.[entity] || {})) {
      properties[field] = derivedValueSchema(derived);
      required.push(field);
    }
    schemas[Entity] = { type: "object", properties, required };

    // Input schema (no auto pk)
    const inputProps: Record<string, unknown> = {};
    const inputRequired: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      if (c.pk && c.auto) continue;
      inputProps[col] = columnValueSchema(c);
      if (c.required && c.default === null && !createRelationshipFields.has(col)) inputRequired.push(col);
    }
    schemas[`${Entity}Input`] = { type: "object", properties: inputProps, required: inputRequired };
    schemas[`${Entity}CreateResult`] = idResultSchema(`Creation result for ${entity}.`);
    schemas[`${Entity}UpdateResult`] = idResultSchema(`Update result for ${entity}.`);
    schemas[`${Entity}DeleteResult`] = deleteResultSchema(entity);

    for (const [opName, op] of Object.entries(ops).filter(([name]) => !CRUD_ACTIONS.has(name))) {
      schemas[operationComponentName(Entity, opName, "Input")] = operationRequestSchema();
      schemas[operationComponentName(Entity, opName, "Result")] = operationResultSchema(op);
    }

    // List endpoint
    const readOp = operationFor(ops, "read");
    const createOp = operationFor(ops, "create");
    const updateOp = operationFor(ops, "update");
    const deleteOp = operationFor(ops, "delete");
    paths[`/api/${entity}s`] = {
      get: withAuth(withAudit(withWorkflow(withPolicy({
        summary: `List ${entity}s`,
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "sort", in: "query", schema: { type: "string" } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          "200": {
            description: "Paginated list",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } },
          },
        },
      }, entity, "read", readOp), readOp), schema, entity, "read", readOp), readOp.public),
      post: withAuth(withAudit(withWorkflow(withPolicy({
        summary: `Create ${entity}`,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}CreateResult` } } } },
          "422": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }, entity, "create", createOp), createOp), schema, entity, "create", createOp), createOp.public),
    };

    // Single entity endpoints
    paths[`/api/${entity}s/{id}`] = {
      get: withAuth(withAudit(withWorkflow(withPolicy({
        summary: `Get ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": foundResponse(`#/components/schemas/${Entity}`, concurrency),
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }, entity, "read", readOp), readOp), schema, entity, "read", readOp), readOp.public),
      put: withAuth(withAudit(withWorkflow(withPolicy({
        summary: `Update ${entity}`,
        parameters: withConcurrencyParameters([{ name: "id", in: "path", required: true, schema: { type: "integer" } }], concurrency),
        requestBody: {
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}UpdateResult` } } } },
          "422": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          ...(concurrency ? { "409": errorResponse("Optimistic concurrency conflict") } : {}),
        },
      }, entity, "update", updateOp), updateOp), schema, entity, "update", updateOp), updateOp.public),
      delete: withAuth(withAudit(withWorkflow(withPolicy({
        summary: `Delete ${entity}`,
        parameters: withConcurrencyParameters([{ name: "id", in: "path", required: true, schema: { type: "integer" } }], concurrency),
        responses: {
          "200": { description: "Deleted", content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}DeleteResult` } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          ...(concurrency ? { "409": errorResponse("Optimistic concurrency conflict") } : {}),
        },
      }, entity, "delete", deleteOp), deleteOp), schema, entity, "delete", deleteOp), deleteOp.public),
    };

    // Custom operations
    for (const opName of Object.keys(ops).filter(op => !CRUD_ACTIONS.has(op))) {
      const inputSchema = operationComponentName(Entity, opName, "Input");
      const resultSchema = operationComponentName(Entity, opName, "Result");
      paths[`/api/${entity}s/{id}/${opName.replace(/_/g, "-")}`] = {
        post: withAuth(withAudit(withWorkflow(withPolicy({
          summary: `${opName.replace(/_/g, " ")} ${entity}`,
          parameters: withConcurrencyParameters([{ name: "id", in: "path", required: true, schema: { type: "integer" } }], concurrency),
          requestBody: {
            required: false,
            content: { "application/json": { schema: { $ref: `#/components/schemas/${inputSchema}` } } },
          },
          responses: {
            "200": { description: "Success", content: { "application/json": { schema: { $ref: `#/components/schemas/${resultSchema}` } } } },
            "409": { description: "Operation precondition failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "422": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        }, entity, opName, ops[opName]), ops[opName]), schema, entity, opName, ops[opName]), ops[opName]?.public),
      };
    }
  }

  if (hasCommerceWorkflow(schema)) {
    const checkout = schema.ecommerce?.checkout;
    schemas.CommerceCartItemOptions = commerceOptionsSchema(schema);
    schemas.CommerceCartItemInput = {
      type: "object",
      properties: {
        item_id: { type: "integer" },
        quantity: {
          type: "integer",
          default: 1,
          minimum: 1,
          ...(checkout?.maxQuantity ? { maximum: checkout.maxQuantity } : {}),
        },
        options: { $ref: "#/components/schemas/CommerceCartItemOptions" },
      },
      required: ["item_id"],
      additionalProperties: false,
    };
    schemas.CommerceCatalogResult = {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", additionalProperties: true } },
        lookups: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
      required: ["items", "lookups"],
    };
    schemas.CommerceCheckoutInput = {
      type: "object",
      properties: {
        user_id: {
          type: "integer",
          description: "Optional service-side override. Browser sessions derive the customer from the bearer identity session.",
        },
        client: { type: "string", default: "web" },
        items: {
          type: "array",
          minItems: 1,
          ...(checkout?.maxLines ? { maxItems: checkout.maxLines } : {}),
          items: { $ref: "#/components/schemas/CommerceCartItemInput" },
        },
      },
      required: ["items"],
      additionalProperties: false,
    };
    schemas.CommerceCheckoutResult = {
      type: "object",
      properties: {
        order_id: { type: "integer" },
        line_item_ids: { type: "array", items: { type: "integer" } },
        amount_pence: { type: "integer" },
        currency: { type: "string" },
        expires_at: { type: "string", format: "date-time" },
        status: { type: "string" },
      },
    };
    schemas.CommercePaymentIntentResult = {
      type: "object",
      properties: {
        order_id: { type: "integer" },
        transaction_id: { type: "integer" },
        reference: { type: "string" },
        amount_pence: { type: "integer" },
        currency: { type: "string" },
        client_secret: { type: "string" },
        provider: { type: "string" },
      },
    };
    paths["/commerce/checkout"] = {
      post: withAuth({
        summary: "Checkout a configured cart",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CommerceCheckoutInput" } } },
        },
        responses: {
          "201": { description: "Order created", content: { "application/json": { schema: { $ref: "#/components/schemas/CommerceCheckoutResult" } } } },
          "422": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };
    paths["/commerce/catalog"] = {
      get: {
        summary: "List configured commerce catalog items",
        responses: {
          "200": { description: "Commerce catalog", content: { "application/json": { schema: { $ref: "#/components/schemas/CommerceCatalogResult" } } } },
        },
      },
    };
    paths["/commerce/orders/{id}/payment-intent"] = {
      post: withAuth({
        summary: "Create a payment intent for a commerce order",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "201": { description: "Payment intent", content: { "application/json": { schema: { $ref: "#/components/schemas/CommercePaymentIntentResult" } } } },
          "409": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };
    paths["/commerce/orders/expire"] = {
      post: withAuth({
        summary: "Expire stale commerce orders",
        responses: {
          "200": { description: "Expired count", content: { "application/json": { schema: { type: "object", properties: { expired: { type: "integer" } } } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };

    schemas.PaymentWebhookInput = {
      type: "object",
      properties: {
        reference: { type: "string" },
        status: { type: "string", enum: ["succeeded", "failed"] },
        provider: { type: "string" },
      },
      required: ["reference", "status"],
    };
    paths["/commerce/payments/webhook"] = {
      post: withWebhookSignature({
        summary: "Receive signed payment provider webhooks",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentWebhookInput" } } },
        },
        responses: {
          "200": { description: "Processed" },
        },
      }),
    };

    if (hasCommerceBookingAliases(schema)) {
    schemas.ReserveBookingInput = {
      type: "object",
      properties: {
        performance_id: { type: "integer" },
        user_id: { type: "integer" },
        quantity: { type: "integer", default: 1 },
        ticket_type: { type: "string", default: "standard" },
        client: { type: "string", default: "web" },
        tickets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticket_type: { type: "string" },
              seat: { type: "string" },
            },
          },
        },
      },
      required: ["performance_id"],
    };
    schemas.ReserveBookingResult = {
      type: "object",
      properties: {
        booking_id: { type: "integer" },
        ticket_ids: { type: "array", items: { type: "integer" } },
        amount_pence: { type: "integer" },
        currency: { type: "string" },
        expires_at: { type: "string", format: "date-time" },
        status: { type: "string" },
      },
    };
    schemas.PaymentIntentResult = {
      type: "object",
      properties: {
        booking_id: { type: "integer" },
        transaction_id: { type: "integer" },
        reference: { type: "string" },
        amount_pence: { type: "integer" },
        currency: { type: "string" },
        client_secret: { type: "string" },
        provider: { type: "string" },
      },
    };
    paths["/commerce/bookings/reserve"] = {
      post: withAuth({
        summary: "Reserve tickets for checkout (compatibility alias)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveBookingInput" } } },
        },
        responses: {
          "201": { description: "Reserved", content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveBookingResult" } } } },
          "422": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };
    paths["/commerce/bookings/{id}/payment-intent"] = {
      post: withAuth({
        summary: "Create a payment intent for a booking (compatibility alias)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "201": { description: "Payment intent", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntentResult" } } } },
          "409": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };
    paths["/commerce/bookings/expire"] = {
      post: withAuth({
        summary: "Expire stale checkout bookings (compatibility alias)",
        responses: {
          "200": { description: "Expired count", content: { "application/json": { schema: { type: "object", properties: { expired: { type: "integer" } } } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };
    }
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: app.apiTitle,
      version: app.version,
      description: app.description,
    },
    servers: [{ url: `http://localhost:${app.defaultPorts.server}` }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Identity session token or service API key.",
        },
        certificateAuth: {
          type: "apiKey",
          in: "header",
          name: "X-Certificate",
          description: "JSON encoded identity certificate.",
        },
        certificateSignature: {
          type: "apiKey",
          in: "header",
          name: "X-Signature",
          description: "Ed25519 signature over METHOD path timestamp.",
        },
        certificateTimestamp: {
          type: "apiKey",
          in: "header",
          name: "X-Timestamp",
          description: "Unix epoch millisecond timestamp included in the certificate signature.",
        },
        paymentWebhookSignature: {
          type: "apiKey",
          in: "header",
          name: "X-OpenB2C-Signature",
          description: "HMAC SHA-256 signature for payment provider webhooks.",
        },
      },
      schemas,
    },
    "x-openb2c-organization": {
      name: app.name,
      description: app.description,
      logo: app.logo,
    },
    "x-openb2c-auth": openApiAuthMetadata(schema),
    ...(auditMetadata ? { "x-openb2c-audit": auditMetadata } : {}),
    ...(workflowMetadata ? { "x-openb2c-workflows": workflowMetadata } : {}),
    ...(validationMetadata ? { "x-openb2c-validation": validationMetadata } : {}),
    ...(ecommerceMetadata ? { "x-openb2c-ecommerce": ecommerceMetadata } : {}),
  };

  return JSON.stringify(spec, null, 2);
}
