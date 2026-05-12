import type { Column, Schema } from "./types";
import { getAppMetadata, hasCommerceWorkflow, hasCommerceBookingAliases, openApiEcommerceMetadata, pascalCase } from "./utils";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);
const AUTH_SECURITY = [
  { bearerAuth: [] },
  { certificateAuth: [], certificateSignature: [], certificateTimestamp: [] },
];
const WEBHOOK_SECURITY = [{ paymentWebhookSignature: [] }];

function errorResponse(description: string): unknown {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
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

export function genOpenAPI(schema: Schema): string {
  const app = getAppMetadata(schema);
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  // Error schema
  schemas.Error = {
    type: "object",
    properties: {
      error: { type: "string" },
      code: { type: "string", enum: ["not_found", "invalid", "bad_state", "conflict", "unauthorized", "forbidden", "rate_limited", "payload_too_large", "unsupported_media_type", "timeout"] },
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
        "400": errorResponse("Validation error"),
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
        "400": errorResponse("Verification failed"),
        "429": errorResponse("Rate limited"),
      },
    },
  };

  for (const [entity, cols] of Object.entries(schema.tables)) {
    const Entity = pascalCase(entity);
    const ops = schema.operations[entity] || {};
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

    // List endpoint
    paths[`/api/${entity}s`] = {
      get: withAuth({
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
      }, ops.read?.public),
      post: withAuth({
        summary: `Create ${entity}`,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }, ops.create?.public),
    };

    // Single entity endpoints
    paths[`/api/${entity}s/{id}`] = {
      get: withAuth({
        summary: `Get ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Found", content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}` } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }, ops.read?.public),
      put: withAuth({
        summary: `Update ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }, ops.update?.public),
      delete: withAuth({
        summary: `Delete ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Deleted", content: { "application/json": { schema: { type: "object", properties: { deleted: { type: "boolean" } } } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }, ops.delete?.public),
    };

    // Custom operations
    for (const opName of Object.keys(ops).filter(op => !CRUD_ACTIONS.has(op))) {
      paths[`/api/${entity}s/{id}/${opName.replace(/_/g, "-")}`] = {
        post: withAuth({
          summary: `${opName.replace(/_/g, " ")} ${entity}`,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Success", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" }, status: { type: "string" } } } } } },
            "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        }, ops[opName]?.public),
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
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
          "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      }),
    };
    paths["/commerce/bookings/{id}/payment-intent"] = {
      post: withAuth({
        summary: "Create a payment intent for a booking (compatibility alias)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "201": { description: "Payment intent", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntentResult" } } } },
          "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
    ...(openApiEcommerceMetadata(schema) ? { "x-openb2c-ecommerce": openApiEcommerceMetadata(schema) } : {}),
  };

  return JSON.stringify(spec, null, 2);
}
