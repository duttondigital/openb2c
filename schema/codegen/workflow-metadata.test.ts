import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { genOpenAPI } from "./openapi";
import { validateSchema } from "./validation";
import type { Column, Operation, Schema } from "./types";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

async function nixEvalJson(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["nix", "eval", "--impure", "--json", ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

async function loadDuchyOperaSchema(): Promise<Schema> {
  const result = await nixEvalJson(["-f", join(PROJECT_ROOT, "examples", "duchyopera", "composition.nix")]);
  if (result.exitCode !== 0) {
    throw new Error(`nix eval failed for duchyopera: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Schema;
}

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
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function workflowSchema(): Schema {
  return {
    organization: { name: "Workflow Test", description: "Workflow test app", logo: null },
    workflows: {
      groups: {
        ticketLifecycle: {
          label: "Ticket lifecycle",
          description: "Ticket state movement.",
          displayPriority: 10,
        },
      },
    },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
      },
      user: {
        id: col({ type: "integer", pk: true, auto: true }),
      },
    },
    operations: {
      ticket: {
        cancel: op({
          guard: { _t: "bin", op: "==", left: { _t: "field", name: "status" }, right: { _t: "lit", value: "reserved" } },
          set: { status: "cancelled" },
          workflow: {
            group: "ticketLifecycle",
            transitions: [{
              field: { table: "ticket", field: "status", references: null },
              from: ["reserved", "confirmed"],
              to: "cancelled",
            }],
            audit: {
              summary: "Cancelled ticket",
              detail: "Cancelled a customer ticket.",
            },
            confirmation: {
              required: true,
              title: "Cancel ticket",
              message: "This will cancel the selected ticket.",
              confirmLabel: "Cancel ticket",
              severity: "warning",
            },
          },
        }),
      },
    },
  };
}

describe("workflow metadata generation", () => {
  test("real examples expose workflow groups, transitions, audit text, and confirmations", async () => {
    const schema = await loadDuchyOperaSchema();

    expect(schema.workflows?.groups.ticketLifecycle).toMatchObject({
      label: "Ticket lifecycle",
      displayPriority: 20,
    });
    expect(schema.workflows?.groups.performanceLifecycle.label).toBe("Performance lifecycle");
    expect(schema.operations.ticket.cancel.workflow?.transitions?.[0]).toMatchObject({
      field: { table: "ticket", field: "status" },
      from: ["reserved", "confirmed"],
      to: "cancelled",
    });
    expect(schema.operations.performance.cancel.workflow?.confirmation).toMatchObject({
      required: true,
      severity: "danger",
    });
    expect(schema.operations.transaction.refund.workflow?.audit?.summary).toBe("Refunded transaction");
  });

  test("OpenAPI includes document workflow metadata and per-operation workflow extensions", () => {
    const openapi = JSON.parse(genOpenAPI(workflowSchema()));

    expect(openapi["x-openb2c-workflows"].groups.ticketLifecycle).toMatchObject({
      label: "Ticket lifecycle",
      displayPriority: 10,
    });
    expect(openapi["x-openb2c-workflows"].operationWorkflows.ticket.cancel).toMatchObject({
      group: "ticketLifecycle",
      preconditions: {
        expression: { _t: "bin", op: "==" },
      },
      audit: { summary: "Cancelled ticket" },
      confirmation: {
        required: true,
        severity: "warning",
        confirmLabel: "Cancel ticket",
      },
    });
    expect(openapi.paths["/api/tickets/{id}/cancel"].post["x-openb2c-workflow"]).toMatchObject({
      group: "ticketLifecycle",
      preconditions: {
        expression: { _t: "bin", op: "==" },
      },
      transitions: [{
        field: { table: "ticket", field: "status", references: null },
        from: ["reserved", "confirmed"],
        to: "cancelled",
      }],
      audit: { summary: "Cancelled ticket" },
    });
  });

  test("validates malformed workflow metadata", () => {
    const schema = workflowSchema();
    schema.operations.ticket.cancel.workflow = {
      group: "missingGroup",
      transitions: [
        {
          field: { table: "ticket", field: "status", references: null },
          from: [],
          to: "void",
        },
        {
          field: { table: "user", field: "id", references: null },
          from: ["reserved"],
          to: "cancelled",
        },
      ],
      confirmation: {
        required: true,
        severity: "critical" as any,
      },
    };

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "operations.ticket.cancel.workflow.group" }),
      expect.objectContaining({ path: "operations.ticket.cancel.workflow.transitions.0.from" }),
      expect.objectContaining({ path: "operations.ticket.cancel.workflow.transitions.0.to" }),
      expect.objectContaining({ path: "operations.ticket.cancel.workflow.transitions.1.field.table" }),
      expect.objectContaining({ path: "operations.ticket.cancel.workflow.confirmation.severity" }),
    ]));
  });
});
