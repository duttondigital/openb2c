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
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function policySchema(): Schema {
  return {
    organization: { name: "Policy Test", description: "Policy test app", logo: null },
    auth: {
      roles: {
        customer: {
          label: "Customer",
          description: "Customer identity",
          audience: "customer",
          defaultScopes: [],
          internal: false,
        },
        staff: {
          label: "Staff",
          description: "Staff identity",
          audience: "staff",
          defaultScopes: [],
          internal: false,
        },
        service: {
          label: "Service",
          description: "Service identity",
          audience: "service",
          defaultScopes: [],
          internal: false,
        },
        system: {
          label: "System",
          description: "System identity",
          audience: "system",
          defaultScopes: ["*"],
          internal: true,
        },
      },
    },
    tables: {
      note: {
        id: col({ type: "integer", pk: true, auto: true }),
        title: col({ required: true }),
      },
    },
    operations: {
      note: {
        read: op({
          public: true,
          policy: {
            label: "Browse notes",
            description: "Public note browsing.",
            audiences: ["anonymous", "customer"],
            risk: "low",
          },
        }),
        publish: op({
          policy: {
            label: "Publish note",
            audiences: ["staff"],
            risk: "high",
          },
        }),
      },
    },
  };
}

describe("role and policy metadata generation", () => {
  test("real examples expose role metadata and operation policy metadata", async () => {
    const schema = await loadDuchyOperaSchema();

    expect(schema.auth?.roles.customer.audience).toBe("customer");
    expect(schema.auth?.roles.service.audience).toBe("service");
    expect(schema.operations.performance.read.policy?.label).toBe("Browse performances");
    expect(schema.operations.ticket.confirm.policy?.audiences).toEqual(["customer", "service"]);
    expect(schema.operations.transaction.refund.policy?.risk).toBe("high");
  });

  test("OpenAPI includes document role metadata and per-operation policy extensions", () => {
    const openapi = JSON.parse(genOpenAPI(policySchema()));

    expect(openapi["x-openb2c-auth"].roles.customer).toMatchObject({
      label: "Customer",
      audience: "customer",
      internal: false,
    });
    expect(openapi["x-openb2c-auth"].roles.system).toMatchObject({
      audience: "system",
      defaultScopes: ["*"],
      internal: true,
    });

    expect(openapi.paths["/api/notes"].get["x-openb2c-policy"]).toMatchObject({
      scope: "note.read",
      public: true,
      audiences: ["anonymous", "customer"],
      risk: "low",
      label: "Browse notes",
    });
    expect(openapi.paths["/api/notes/{id}/publish"].post["x-openb2c-policy"]).toMatchObject({
      scope: "note.publish",
      public: false,
      audiences: ["staff"],
      risk: "high",
      label: "Publish note",
    });
  });

  test("derives audiences from public and relationship policy when omitted", () => {
    const schema = policySchema();
    schema.operations.note.read.policy = {};
    schema.operations.note.publish.policy = {};
    const openapi = JSON.parse(genOpenAPI(schema));

    expect(openapi.paths["/api/notes"].get["x-openb2c-policy"].audiences).toEqual(["anonymous", "customer", "staff", "service"]);
    expect(openapi.paths["/api/notes/{id}/publish"].post["x-openb2c-policy"].audiences).toEqual(["staff", "service"]);
  });

  test("validates invalid operation policy metadata", () => {
    const schema = policySchema();
    schema.operations.note.read.policy = {
      audiences: ["customer"],
      risk: "extreme" as any,
    };
    schema.operations.note.publish.policy = {
      audiences: ["partner" as any],
    };

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "operations.note.read.policy.risk" }),
      expect.objectContaining({ path: "operations.note.read.policy.audiences" }),
      expect.objectContaining({ path: "operations.note.publish.policy.audiences.0" }),
    ]));
  });
});
