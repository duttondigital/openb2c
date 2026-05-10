import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { genMcpServer } from "./mcp";
import { genOpenAPI } from "./openapi";
import { genRoutes } from "./server";
import { genAppShell } from "./ui";
import type { Schema } from "./types";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

async function loadExampleSchema(example: string): Promise<Schema> {
  const proc = Bun.spawn(
    ["nix", "eval", "--json", "-f", join(PROJECT_ROOT, "examples", example, "composition.nix")],
    {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`nix eval failed for ${example}: ${stderr}`);
  }

  return JSON.parse(stdout) as Schema;
}

function generatedMetadataArtifacts(schema: Schema): string {
  return [
    genRoutes(schema),
    genMcpServer(schema),
    genOpenAPI(schema),
    genAppShell(schema),
  ].join("\n");
}

describe("application metadata", () => {
  test("real example compositions generate isolated app metadata", async () => {
    const duchyOpera = await loadExampleSchema("duchyopera");
    const ticketing = await loadExampleSchema("ticketing");

    expect(duchyOpera.organization).toMatchObject({
      name: "Duchy Opera",
      description: "Cornish charity opera company",
      logo: {
        alt: "Duchy Opera",
      },
    });
    expect(duchyOpera.organization.logo?.src.endsWith("examples/duchyopera/logo/duchy-opera-icon.svg")).toBe(true);
    expect(duchyOpera).not.toHaveProperty("service");
    expect(ticketing.organization).toMatchObject({
      name: "OpenB2C",
      description: "OpenB2C framework examples",
      logo: null,
    });
    expect(ticketing).not.toHaveProperty("service");

    const duchyOpenApi = JSON.parse(genOpenAPI(duchyOpera));
    expect(duchyOpenApi.info).toMatchObject({
      title: "Duchy Opera API",
      version: "0.1.0",
      description: "Cornish charity opera company",
    });
    expect(duchyOpenApi["x-openb2c-organization"]).toMatchObject({
      name: "Duchy Opera",
      description: "Cornish charity opera company",
      logo: {
        alt: "Duchy Opera",
      },
    });
    expect(duchyOpenApi.servers).toEqual([{ url: "http://localhost:3085" }]);

    const ticketingOpenApi = JSON.parse(genOpenAPI(ticketing));
    expect(ticketingOpenApi.info).toMatchObject({
      title: "OpenB2C API",
      version: "0.1.0",
      description: "OpenB2C framework examples",
    });
    expect(ticketingOpenApi["x-openb2c-organization"].logo).toBeNull();
    expect(ticketingOpenApi.servers).toEqual([{ url: "http://localhost:3085" }]);

    const duchyArtifacts = generatedMetadataArtifacts(duchyOpera);
    expect(duchyArtifacts).toContain('"databasePath": "duchy-opera.db"');
    expect(duchyArtifacts).toContain('"slug": "duchy-opera"');
    expect(duchyArtifacts).toContain("<title>Duchy Opera</title>");
    expect(duchyArtifacts).not.toContain("OpenB2C API");
    expect(duchyArtifacts).not.toContain("openb2c.db");
    expect(duchyArtifacts).not.toContain("http://localhost:3185");

    const ticketingArtifacts = generatedMetadataArtifacts(ticketing);
    expect(ticketingArtifacts).toContain('"databasePath": "openb2c.db"');
    expect(ticketingArtifacts).toContain('"slug": "openb2c"');
    expect(ticketingArtifacts).toContain("<title>OpenB2C</title>");
    expect(ticketingArtifacts).toContain("http://localhost:3085");
    expect(ticketingArtifacts).not.toContain("Duchy Opera API");
    expect(ticketingArtifacts).not.toContain("duchy-opera.db");
    expect(ticketingArtifacts).not.toContain("opera.db");
  });
});
