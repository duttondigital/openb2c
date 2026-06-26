import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { genOpenAPI } from "./openapi";
import { validateSchema } from "./validation";
import type { Column, Schema } from "./types";
import { fieldRelationship } from "../ui/format";

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

function relationshipSchema(): Schema {
  return {
    organization: { name: "Relationship Test", description: "Relationship test app", logo: null },
    tables: {
      venue: {
        id: col({ type: "integer", pk: true, auto: true }),
        name: col({ required: true }),
      },
      performance: {
        id: col({ type: "integer", pk: true, auto: true }),
        title: col({ required: true }),
        venue_id: col({
          type: "integer",
          required: true,
          references: "venue(id)",
          metadata: { label: "Venue" },
          relationship: {
            label: "Venue",
            description: "Venue hosting the performance.",
            cardinality: "one",
          },
        }),
      },
    },
    operations: {},
  };
}

describe("relationship metadata generation", () => {
  test("real examples expose generic relationship metadata", async () => {
    const duchy = await loadExampleSchema("duchyopera");
    const ticketing = await loadExampleSchema("ticketing");

    expect(duchy.tables.performance.venue_id.relationship).toMatchObject({ label: "Venue" });
    expect(duchy.tables.ticket.performance_id.relationship).toMatchObject({ label: "Performance" });
    expect(ticketing.tables.issue.project_id.relationship).toMatchObject({ label: "Project" });
    expect(ticketing.tables.comment.author_id.relationship).toMatchObject({ label: "Author" });
  });

  test("threads relationship metadata into OpenAPI field extensions", () => {
    const openapi = JSON.parse(genOpenAPI(relationshipSchema()));
    const venue = openapi.components.schemas.PerformanceInput.properties.venue_id;

    expect(venue["x-openb2c-relationship"]).toEqual({
      targetEntity: "venue",
      targetField: "id",
      cardinality: "one",
      label: "Venue",
      description: "Venue hosting the performance.",
    });
    expect(fieldRelationship(venue).label).toBe("Venue");
  });

  test("emits relationship hints for raw foreign keys even without metadata", () => {
    const schema = relationshipSchema();
    schema.tables.performance.venue_id.relationship = null;
    const openapi = JSON.parse(genOpenAPI(schema));

    expect(openapi.components.schemas.PerformanceInput.properties.venue_id["x-openb2c-relationship"]).toMatchObject({
      targetEntity: "venue",
      targetField: "id",
      cardinality: "one",
      label: "Venue",
    });
  });

  test("validates invalid relationship metadata", () => {
    const schema = relationshipSchema();
    schema.tables.performance.title.relationship = { label: "Invalid" };
    schema.tables.performance.venue_id.relationship = {
      cardinality: "some" as any,
    };

    expect(validateSchema(schema)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tables.performance.title.relationship" }),
      expect.objectContaining({ path: "tables.performance.venue_id.relationship.cardinality" }),
    ]));
  });
});
