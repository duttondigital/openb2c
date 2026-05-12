import { describe, expect, test } from "bun:test";
import { genMcpServer } from "./mcp";
import type { Column, Operation, Schema } from "./types";

const baseColumn: Column = {
  type: "text",
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

function col(overrides: Partial<Column>): Column {
  return { ...baseColumn, ...overrides };
}

function op(overrides: Partial<Operation> = {}): Operation {
  return {
    guard: null,
    relationships: [],
    public: false,
    scope: null,
    policy: {},
    workflow: {},
    audit: {},
    set: {},
    cascade: [],
    effects: [],
    ...overrides,
  };
}

function metadataSchema(): Schema {
  return {
    organization: { name: "MCP Metadata", description: "MCP metadata test app", logo: null },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        performance_id: col({
          type: "integer",
          required: true,
          references: "performance(id)",
          metadata: { label: "Performance", displayPriority: 10 },
          relationship: { label: "Performance", description: "Performance this ticket admits the customer to." },
        }),
        status: col({
          metadata: { label: "Status", displayPriority: 20 },
          validation: { enum: ["reserved", "cancelled"] },
        }),
        secret_token: col({
          metadata: { label: "Secret token", privacy: "secret", redact: true },
        }),
      },
    },
    operations: {
      ticket: {
        read: op({
          public: true,
          policy: {
            label: "Browse tickets",
            description: "Public ticket browsing.",
            audiences: ["anonymous", "customer"],
            risk: "low",
          },
        }),
        cancel: op({
          policy: {
            label: "Cancel ticket",
            description: "Cancel a reserved ticket.",
            audiences: ["customer"],
            risk: "medium",
          },
          workflow: {
            audit: { summary: "Cancelled ticket" },
            confirmation: {
              required: true,
              confirmLabel: "Cancel ticket",
              severity: "warning",
            },
          },
          set: { status: "cancelled" },
        }),
      },
    },
  };
}

describe("MCP metadata generation", () => {
  test("uses ontology metadata for generated tool descriptions", () => {
    const mcp = genMcpServer(metadataSchema());

    expect(mcp).toContain(`description: ${JSON.stringify("Browse tickets. Public ticket browsing. Key fields: Performance, Status.")}`);
    expect(mcp).toContain(`description: ${JSON.stringify("Delete a Ticket record. Key fields: Performance, Status.")}`);
    expect(mcp).toContain(`description: ${JSON.stringify("Cancel ticket. Cancel a reserved ticket. Workflow: Cancelled ticket. Requires confirmation: Cancel ticket.")}`);
    expect(mcp).not.toContain("Secret token");
  });
});
