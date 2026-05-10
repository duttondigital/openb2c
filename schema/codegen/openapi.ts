import type { Schema } from "./types";
import { getAppMetadata, hasCommerceWorkflow, legacyCommerceWorkflow, openApiEcommerceMetadata, pascalCase } from "./utils";

const CRUD_ACTIONS = new Set(["read", "create", "update", "delete"]);

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

  paths["/auth/context"] = {
    get: {
      summary: "Current authenticated context",
      responses: {
        "200": { description: "Authenticated context", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthContext" } } } },
        "401": { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
      properties[col] = {
        type: c.type === "integer" ? "integer" : "string",
        ...(c.default !== null && { default: c.default }),
      };
      if (c.required || c.pk) required.push(col);
    }
    schemas[Entity] = { type: "object", properties, required };

    // Input schema (no auto pk)
    const inputProps: Record<string, unknown> = {};
    const inputRequired: string[] = [];
    for (const [col, c] of Object.entries(cols)) {
      if (c.pk && c.auto) continue;
      inputProps[col] = { type: c.type === "integer" ? "integer" : "string" };
      if (c.required && c.default === null && !createRelationshipFields.has(col)) inputRequired.push(col);
    }
    schemas[`${Entity}Input`] = { type: "object", properties: inputProps, required: inputRequired };

    // List endpoint
    paths[`/api/${entity}s`] = {
      get: {
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
      },
      post: {
        summary: `Create ${entity}`,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}Input` } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };

    // Single entity endpoints
    paths[`/api/${entity}s/{id}`] = {
      get: {
        summary: `Get ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Found", content: { "application/json": { schema: { $ref: `#/components/schemas/${Entity}` } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      put: {
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
      },
      delete: {
        summary: `Delete ${entity}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Deleted", content: { "application/json": { schema: { type: "object", properties: { deleted: { type: "boolean" } } } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };

    // Custom operations
    for (const opName of Object.keys(ops).filter(op => !CRUD_ACTIONS.has(op))) {
      paths[`/api/${entity}s/{id}/${opName.replace(/_/g, "-")}`] = {
        post: {
          summary: `${opName.replace(/_/g, " ")} ${entity}`,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Success", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" }, status: { type: "string" } } } } } },
            "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      };
    }
  }

  if (hasCommerceWorkflow(schema)) {
    schemas.CommerceCartItemInput = {
      type: "object",
      properties: {
        item_id: { type: "integer" },
        quantity: { type: "integer", default: 1 },
        options: { type: "object", additionalProperties: { oneOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] } },
      },
      required: ["item_id"],
    };
    schemas.CommerceCheckoutInput = {
      type: "object",
      properties: {
        user_id: { type: "integer" },
        client: { type: "string", default: "web" },
        items: { type: "array", items: { $ref: "#/components/schemas/CommerceCartItemInput" } },
      },
      required: ["items"],
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
      post: {
        summary: "Checkout a configured cart",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CommerceCheckoutInput" } } },
        },
        responses: {
          "201": { description: "Order created", content: { "application/json": { schema: { $ref: "#/components/schemas/CommerceCheckoutResult" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };
    paths["/commerce/orders/{id}/payment-intent"] = {
      post: {
        summary: "Create a payment intent for a commerce order",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "201": { description: "Payment intent", content: { "application/json": { schema: { $ref: "#/components/schemas/CommercePaymentIntentResult" } } } },
          "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };
    paths["/commerce/orders/expire"] = {
      post: {
        summary: "Expire stale commerce orders",
        responses: {
          "200": { description: "Expired count", content: { "application/json": { schema: { type: "object", properties: { expired: { type: "integer" } } } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
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
      post: {
        summary: "Receive signed payment provider webhooks",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentWebhookInput" } } },
        },
        responses: {
          "200": { description: "Processed" },
          "401": { description: "Invalid signature", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };

    if (legacyCommerceWorkflow(schema)) {
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
      post: {
        summary: "Reserve tickets for checkout (compatibility alias)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveBookingInput" } } },
        },
        responses: {
          "201": { description: "Reserved", content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveBookingResult" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };
    paths["/commerce/bookings/{id}/payment-intent"] = {
      post: {
        summary: "Create a payment intent for a booking (compatibility alias)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "201": { description: "Payment intent", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntentResult" } } } },
          "400": { description: "Operation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    };
    paths["/commerce/bookings/expire"] = {
      post: {
        summary: "Expire stale checkout bookings (compatibility alias)",
        responses: {
          "200": { description: "Expired count", content: { "application/json": { schema: { type: "object", properties: { expired: { type: "integer" } } } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
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
    components: { schemas },
    "x-openb2c-organization": {
      name: app.name,
      description: app.description,
      logo: app.logo,
    },
    ...(openApiEcommerceMetadata(schema) ? { "x-openb2c-ecommerce": openApiEcommerceMetadata(schema) } : {}),
  };

  return JSON.stringify(spec, null, 2);
}
