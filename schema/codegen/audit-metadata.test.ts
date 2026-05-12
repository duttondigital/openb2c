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
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, audit: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function auditSchema(): Schema {
  return {
    organization: { name: "Audit Test", description: "Audit metadata test app", logo: null },
    audit: {
      entities: {
        ticket: {
          operations: ["create", "update", "cancel"],
          category: "workflow",
          reason: "Tickets are customer entitlements.",
        },
      },
    },
    tables: {
      ticket: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
      },
    },
    operations: {
      ticket: {
        cancel: op({
          audit: {
            required: true,
            category: "payment",
            reason: "Cancellation can affect refunds.",
          },
          set: { status: "cancelled" },
        }),
      },
    },
  };
}

describe("audit metadata generation", () => {
  test("real examples expose entity and operation audit requirements", async () => {
    const schema = await loadDuchyOperaSchema();

    expect(schema.audit?.entities.ticket).toMatchObject({
      category: "workflow",
      operations: expect.arrayContaining(["create", "confirm", "use"]),
    });
    expect(schema.audit?.entities.transaction.category).toBe("payment");
    expect(schema.operations.performance.cancel.audit).toMatchObject({
      required: true,
      category: "workflow",
    });
  });

  test("OpenAPI includes document and per-operation audit extensions", () => {
    const openapi = JSON.parse(genOpenAPI(auditSchema()));

    expect(openapi["x-openb2c-audit"].entities.ticket).toMatchObject({
      category: "workflow",
      operations: ["create", "update", "cancel"],
    });
    expect(openapi["x-openb2c-audit"].operationAuditRequirements.ticket.create).toMatchObject({
      required: true,
      category: "workflow",
      reason: "Tickets are customer entitlements.",
    });
    expect(openapi.paths["/api/tickets"].post["x-openb2c-audit"]).toMatchObject({
      required: true,
      category: "workflow",
    });
    expect(openapi.paths["/api/tickets/{id}/cancel"].post["x-openb2c-audit"]).toMatchObject({
      required: true,
      category: "payment",
      reason: "Cancellation can affect refunds.",
    });
    expect(openapi.paths["/api/tickets/{id}"].get["x-openb2c-audit"]).toBeUndefined();
  });

  test("validates invalid audit metadata", () => {
    const schema = auditSchema();
    schema.audit!.entities.ticket.operations = ["cancel", "missing"];
    schema.audit!.entities.ticket.category = "privacy" as any;
    schema.audit!.entities.ghost = {
      operations: ["create"],
      category: "data",
    };
    schema.operations.ticket.cancel.audit = {
      required: true,
      category: "finance" as any,
    };

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "audit.entities.ticket.category" }),
      expect.objectContaining({ path: "audit.entities.ticket.operations.1" }),
      expect.objectContaining({ path: "audit.entities.ghost" }),
      expect.objectContaining({ path: "operations.ticket.cancel.audit.category" }),
    ]));
  });
});
