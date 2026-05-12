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
        seat: col({
          metadata: {
            label: "Seat",
            helpText: "Seat label printed on ticket.",
            displayPriority: 30,
          },
          validation: { maxLength: 24 },
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

    expect(mcp).toContain(`description: ${JSON.stringify("Browse tickets. Public ticket browsing. Key fields: Performance, Status, Seat.")}`);
    expect(mcp).toContain(`description: ${JSON.stringify("Delete a Ticket record. Key fields: Performance, Status, Seat.")}`);
    expect(mcp).toContain(`description: ${JSON.stringify("Cancel ticket. Cancel a reserved ticket. Workflow: Cancelled ticket. Requires confirmation: Cancel ticket.")}`);
    expect(mcp).not.toContain("Secret token");
  });

  test("threads field metadata and validation into MCP input schemas", () => {
    const mcp = genMcpServer(metadataSchema());

    expect(mcp).toContain('"performance_id":{"type":"number","title":"Performance","description":"Performance this ticket admits the customer to."}');
    expect(mcp).toContain('"status":{"type":"string","title":"Status","description":"Status field.","enum":["reserved","cancelled"]}');
    expect(mcp).toContain('"seat":{"type":"string","title":"Seat","description":"Seat label printed on ticket.","maxLength":24}');
    expect(mcp).toContain('"id":{"type":"number","title":"Ticket ID","description":"Identifier for the Ticket record."}');
    expect(mcp).toContain('"limit":{"type":"number","description":"Maximum number of records to return.","minimum":1}');
    expect(mcp).toContain('"sort":{"type":"string","description":"Field to sort by.","enum":["id","performance_id","status","seat"]}');
    expect(mcp).toContain('"filter":{"type":"object","description":"Exact-match filters keyed by field."');
  });
});
