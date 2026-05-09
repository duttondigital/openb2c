import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Schema } from "./types";

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

async function loadExampleSchema(example: string): Promise<Schema> {
  const result = await nixEvalJson(["-f", join(PROJECT_ROOT, "examples", example, "composition.nix")]);
  if (result.exitCode !== 0) {
    throw new Error(`nix eval failed for ${example}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Schema;
}

function relationshipFields(schema: Schema, entity: string, operation: string): string[] {
  return schema.operations[entity][operation].relationships.map(rel => rel.field.field);
}

describe("relationship convention resolution", () => {
  test("user_id relationships are inferred for CRUD and inherited by operations", async () => {
    const schema = await loadExampleSchema("duchyopera");

    expect(relationshipFields(schema, "ticket", "read")).toEqual(["user_id"]);
    expect(relationshipFields(schema, "ticket", "create")).toEqual(["user_id"]);
    expect(relationshipFields(schema, "ticket", "update")).toEqual(["user_id"]);
    expect(relationshipFields(schema, "ticket", "delete")).toEqual(["user_id"]);
    expect(relationshipFields(schema, "ticket", "confirm")).toEqual(["user_id"]);
    expect(relationshipFields(schema, "ticket", "use")).toEqual([]);
  });

  test("requested relationship names resolve to matching user foreign keys", async () => {
    const schema = await loadExampleSchema("ticketing");

    expect(relationshipFields(schema, "issue", "read")).toEqual(["creator_id", "assignee_id"]);
    expect(relationshipFields(schema, "issue", "create")).toEqual(["creator_id"]);
    expect(relationshipFields(schema, "issue", "start")).toEqual(["creator_id", "assignee_id"]);
    expect(relationshipFields(schema, "issue", "assign")).toEqual([]);
    expect(relationshipFields(schema, "comment", "edit")).toEqual(["author_id"]);
    expect(relationshipFields(schema, "project", "archive")).toEqual(["owner_id"]);
  });

  test("user self relationship resolves to user.id without requiring config", async () => {
    const schema = await loadExampleSchema("duchyopera");

    expect(relationshipFields(schema, "user", "read")).toEqual(["id"]);
    expect(relationshipFields(schema, "user", "update")).toEqual(["id"]);
    expect(relationshipFields(schema, "user", "upgrade_to_patron")).toEqual(["id"]);
    expect(relationshipFields(schema, "user", "create")).toEqual([]);
  });

  test("unresolvable relationship names fail composition", async () => {
    const expr = `
      let
        lib = import <nixpkgs/lib>;
        composeLib = import ./schema/lib/compose.nix { inherit lib; };
        modules = lib.evalModules {
          modules = [
            ./schema/base.nix
            ({ ... }: {
              tables.document = {
                id = { type = "integer"; pk = true; auto = true; };
                title = { type = "text"; required = true; };
              };
              operations.document.read.relationships = [ "owner" ];
            })
          ];
        };
      in {
        operations = composeLib.processOperations modules.config.tables modules.config.relationships modules.config.operations;
      }
    `;

    const result = await nixEvalJson(["--expr", expr]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Cannot resolve relationship 'owner' for document");
    expect(result.stderr).toContain("document.owner_id");
  });
});
