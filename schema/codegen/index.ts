/**
 * Generates SQLite schema, TypeScript types, and services from Nix schema.
 *
 * Usage: nix eval --json -f schema/default.nix | bun schema/codegen/index.ts
 */

export type { Column, Tables, Expr, Cascade, Effect, Operation, Operations, Schema } from "./types";
export { pascalCase, camelCase, quoteReserved, TS_TYPE_MAP } from "./utils";
export { sqlType, genSQL } from "./sql";
export { tsType, genRowInterface, genInputInterface, genTypes } from "./typescript";
export { compileExpr, extractRelations } from "./expr";
export { genServices } from "./services";
export { genRoutes } from "./server";
export { genMcpServer } from "./mcp";
export { genEffectsInterface } from "./effects";
export { genOpenAPI } from "./openapi";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Schema } from "./types";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { genServices } from "./services";
import { genEffectsInterface } from "./effects";
import { genRoutes } from "./server";
import { genMcpServer } from "./mcp";
import { genOpenAPI } from "./openapi";

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const schema: Schema = JSON.parse(input);

  // Accept output directory as first argument, default to src/generated for backward compatibility
  const outDir = Bun.argv[2] || join(import.meta.dir, "..", "..", "src", "generated");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "schema.sql"), genSQL(schema.tables));
  writeFileSync(join(outDir, "types.ts"), genTypes(schema.tables));
  writeFileSync(join(outDir, "services.ts"), genServices(schema));
  writeFileSync(join(outDir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(outDir, "server.ts"), genRoutes(schema));
  writeFileSync(join(outDir, "mcp.ts"), genMcpServer(schema));
  writeFileSync(join(outDir, "openapi.json"), genOpenAPI(schema));

  console.log(`wrote ${outDir}/schema.sql`);
  console.log(`wrote ${outDir}/types.ts`);
  console.log(`wrote ${outDir}/services.ts`);
  console.log(`wrote ${outDir}/effects.ts`);
  console.log(`wrote ${outDir}/server.ts`);
  console.log(`wrote ${outDir}/mcp.ts`);
  console.log(`wrote ${outDir}/openapi.json`);
}
