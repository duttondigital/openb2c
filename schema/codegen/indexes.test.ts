import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { genSQL } from "./sql";
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

describe("ontology indexes", () => {
  test("example compositions expose index metadata and SQL index statements", async () => {
    const duchyOpera = await loadExampleSchema("duchyopera");
    const ticketing = await loadExampleSchema("ticketing");

    expect(duchyOpera.indexes?.ticket?.by_user_status).toEqual({
      columns: ["user_id", "status"],
      unique: false,
    });
    expect(duchyOpera.indexes?.performance?.by_venue_date).toEqual({
      columns: ["venue_id", "date"],
      unique: false,
    });
    expect(ticketing.indexes?.issue?.by_project_status).toEqual({
      columns: ["project_id", "status"],
      unique: false,
    });

    const duchySql = genSQL(duchyOpera.tables, duchyOpera.indexes);
    const ticketingSql = genSQL(ticketing.tables, ticketing.indexes);
    expect(duchySql).toContain("CREATE INDEX IF NOT EXISTS ticket_by_user_status ON ticket (user_id, status);");
    expect(duchySql).toContain("CREATE INDEX IF NOT EXISTS performance_by_venue_date ON performance (venue_id, date);");
    expect(ticketingSql).toContain("CREATE INDEX IF NOT EXISTS issue_by_project_status ON issue (project_id, status);");
  });
});
