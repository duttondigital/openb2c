/**
 * Generates SQLite schema, TypeScript types, and services from Nix schema.
 *
 * Usage: nix eval --json -f schema/default.nix | bun schema/codegen/index.ts
 */

export type { AppMetadata, OrganizationMetadata, Column, Tables, Index, Indexes, Expr, Cascade, Effect, Operation, Operations, Schema } from "./types";
export { DEFAULT_ORGANIZATION_METADATA, SYSTEM_DEFAULT_PORTS, SYSTEM_DEFAULT_VERSION, getAppMetadata, getDefaultDatabasePath, hasCommerceWorkflow, pascalCase, camelCase, quoteReserved, TS_TYPE_MAP } from "./utils";
export { envVarSpecs, requiredProductionEnvVars, genEnvExample } from "./config";
export { sqlType, genSQL } from "./sql";
export { planMigration, generateMigrationStub } from "./migration";
export { tsType, genRowInterface, genInputInterface, genTypes } from "./typescript";
export { compileExpr, extractRelations } from "./expr";
export { genServices } from "./services";
export { genRoutes } from "./server";
export { genMcpServer } from "./mcp";
export { genEffectsInterface } from "./effects";
export { genOpenAPI } from "./openapi";
export { genAppShell } from "./ui";

import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type { Schema } from "./types";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { genServices } from "./services";
import { genEffectsInterface } from "./effects";
import { genRoutes } from "./server";
import { genMcpServer } from "./mcp";
import { genOpenAPI } from "./openapi";
import { genAppShell } from "./ui";
import { genEnvExample } from "./config";

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const schema: Schema = JSON.parse(input);

  // Accept output directory as first argument, default to src/generated for backward compatibility
  const outDir = Bun.argv[2] || join(import.meta.dir, "..", "..", "src", "generated");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "schema.sql"), genSQL(schema.tables, schema.indexes));
  writeFileSync(join(outDir, "types.ts"), genTypes(schema.tables, schema.operations));
  writeFileSync(join(outDir, "services.ts"), genServices(schema));
  writeFileSync(join(outDir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(outDir, "server.ts"), genRoutes(schema));
  writeFileSync(join(outDir, "mcp.ts"), genMcpServer(schema));
  writeFileSync(join(outDir, "openapi.json"), genOpenAPI(schema));
  writeFileSync(join(outDir, ".env.example"), genEnvExample(schema));

  console.log(`wrote ${outDir}/schema.sql`);
  console.log(`wrote ${outDir}/types.ts`);
  console.log(`wrote ${outDir}/services.ts`);
  console.log(`wrote ${outDir}/effects.ts`);
  console.log(`wrote ${outDir}/server.ts`);
  console.log(`wrote ${outDir}/mcp.ts`);
  console.log(`wrote ${outDir}/openapi.json`);
  console.log(`wrote ${outDir}/.env.example`);

  // Generate UI
  const uiDir = join(outDir, "ui");
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(join(uiDir, "index.html"), genAppShell(schema));
  writeFileSync(join(uiDir, "openapi.json"), genOpenAPI(schema));

  // Bundle web components
  const uiEntry = resolve(import.meta.dir, "..", "ui", "index.ts");
  const result = await Bun.build({
    entrypoints: [uiEntry],
    outdir: uiDir,
    naming: "app.js",
    minify: true,
  });
  if (!result.success) {
    console.error("UI bundle failed:", result.logs);
    process.exit(1);
  }

  console.log(`wrote ${uiDir}/index.html`);
  console.log(`wrote ${uiDir}/app.js`);
}
