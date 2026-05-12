/**
 * Generates SQLite schema, TypeScript types, and services from Nix schema.
 *
 * Usage: nix eval --json -f schema/default.nix | bun schema/codegen/index.ts
 */

export type { AppMetadata, OrganizationMetadata, Column, DerivedField, DerivedFields, Tables, Index, Indexes, Expr, Cascade, Effect, Operation, Operations, Schema } from "./types";
export { DEFAULT_ORGANIZATION_METADATA, SYSTEM_DEFAULT_PORTS, SYSTEM_DEFAULT_VERSION, getAppMetadata, getDefaultDatabasePath, hasCommerceWorkflow, pascalCase, camelCase, quoteReserved, TS_TYPE_MAP } from "./utils";
export { envVarSpecs, requiredProductionEnvVars, genEnvExample } from "./config";
export { sqlType, genSQL } from "./sql";
export { planMigration, generateMigrationStub } from "./migration";
export { tsType, genRowInterface, genInputInterface, genTypes } from "./typescript";
export { compileExpr, extractRelations } from "./expr";
export { genServices } from "./services";
export { genRuntime } from "./runtime";
export { genRoutes } from "./server";
export { genMcpServer } from "./mcp";
export { genEffectsInterface } from "./effects";
export { genOpenAPI } from "./openapi";
export { genAdminAppShell, genAppShell, genPublicAppShell } from "./ui";
export { genAdminStylesheet, genPublicStylesheet } from "./ui-styles";
export { assertValidSchema, formatSchemaDiagnostics, validateSchema, SchemaValidationError } from "./validation";

import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "fs";
import { extname, isAbsolute, join, resolve } from "path";
import type { Schema } from "./types";
import { genSQL } from "./sql";
import { genTypes } from "./typescript";
import { genServices } from "./services";
import { genRuntime } from "./runtime";
import { genEffectsInterface } from "./effects";
import { genRoutes } from "./server";
import { genMcpServer } from "./mcp";
import { genOpenAPI } from "./openapi";
import { genAdminAppShell, genPublicAppShell } from "./ui";
import { genEnvExample } from "./config";
import { genAdminStylesheet, genPublicStylesheet } from "./ui-styles";
import { assertValidSchema, formatSchemaDiagnostics, SchemaValidationError } from "./validation";

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const schema: Schema = JSON.parse(input);
  try {
    assertValidSchema(schema);
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      console.error(formatSchemaDiagnostics(err.diagnostics));
      process.exit(1);
    }
    throw err;
  }

  // Accept output directory as first argument, default to src/generated for backward compatibility
  const outDir = Bun.argv[2] || join(import.meta.dir, "..", "..", "src", "generated");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "schema.sql"), genSQL(schema.tables, schema.indexes));
  writeFileSync(join(outDir, "types.ts"), genTypes(schema.tables, schema.operations, schema.derived));
  writeFileSync(join(outDir, "services.ts"), genServices(schema));
  writeFileSync(join(outDir, "runtime.ts"), genRuntime(schema));
  writeFileSync(join(outDir, "effects.ts"), genEffectsInterface(schema));
  writeFileSync(join(outDir, "server.ts"), genRoutes(schema));
  writeFileSync(join(outDir, "mcp.ts"), genMcpServer(schema));
  const openApiJson = genOpenAPI(schema);
  writeFileSync(join(outDir, "openapi.json"), openApiJson);
  writeFileSync(join(outDir, ".env.example"), genEnvExample(schema));

  console.log(`wrote ${outDir}/schema.sql`);
  console.log(`wrote ${outDir}/types.ts`);
  console.log(`wrote ${outDir}/services.ts`);
  console.log(`wrote ${outDir}/runtime.ts`);
  console.log(`wrote ${outDir}/effects.ts`);
  console.log(`wrote ${outDir}/server.ts`);
  console.log(`wrote ${outDir}/mcp.ts`);
  console.log(`wrote ${outDir}/openapi.json`);
  console.log(`wrote ${outDir}/.env.example`);

  // Generate UI
  const uiDir = join(outDir, "ui");
  const adminUiDir = join(uiDir, "admin");
  mkdirSync(uiDir, { recursive: true });
  mkdirSync(adminUiDir, { recursive: true });
  const uiSchema = prepareUiSchema(schema, uiDir, adminUiDir);
  const uiOpenApiJson = genOpenAPI(uiSchema);
  writeFileSync(join(uiDir, "index.html"), genPublicAppShell(schema));
  writeFileSync(join(uiDir, "styles.css"), genPublicStylesheet());
  writeFileSync(join(uiDir, "openapi.json"), uiOpenApiJson);
  writeFileSync(join(adminUiDir, "index.html"), genAdminAppShell(schema));
  writeFileSync(join(adminUiDir, "styles.css"), genAdminStylesheet());
  writeFileSync(join(adminUiDir, "openapi.json"), uiOpenApiJson);
  rmSync(join(uiDir, "chunks"), { recursive: true, force: true });
  rmSync(join(adminUiDir, "chunks"), { recursive: true, force: true });

  // Bundle public and admin web components separately so customer-facing pages
  // do not ship generated admin data-management code.
  const publicUiEntry = resolve(import.meta.dir, "..", "ui", "public.ts");
  const adminUiEntry = resolve(import.meta.dir, "..", "ui", "admin.ts");
  const publicResult = await Bun.build({
    entrypoints: [publicUiEntry],
    outdir: uiDir,
    naming: {
      entry: "app.js",
      chunk: "chunks/[name]-[hash].js",
    },
    splitting: true,
    format: "esm",
    minify: true,
  });
  if (!publicResult.success) {
    console.error("Public UI bundle failed:", publicResult.logs);
    process.exit(1);
  }

  const adminResult = await Bun.build({
    entrypoints: [adminUiEntry],
    outdir: adminUiDir,
    naming: {
      entry: "app.js",
      chunk: "chunks/[name]-[hash].js",
    },
    splitting: true,
    format: "esm",
    minify: true,
  });
  if (!adminResult.success) {
    console.error("Admin UI bundle failed:", adminResult.logs);
    process.exit(1);
  }

  console.log(`wrote ${uiDir}/index.html`);
  console.log(`wrote ${uiDir}/styles.css`);
  console.log(`wrote ${uiDir}/app.js`);
  console.log(`wrote ${adminUiDir}/index.html`);
  console.log(`wrote ${adminUiDir}/styles.css`);
  console.log(`wrote ${adminUiDir}/app.js`);
}

function prepareUiSchema(schema: Schema, uiDir: string, adminUiDir: string): Schema {
  const logo = schema.organization?.logo;
  if (!logo?.src) return schema;

  const copiedLogo = copyLocalLogo(logo.src, uiDir, adminUiDir);
  if (!copiedLogo) return schema;

  return {
    ...schema,
    organization: {
      ...schema.organization,
      logo: {
        ...logo,
        src: copiedLogo,
      },
    },
  };
}

function copyLocalLogo(src: string, uiDir: string, adminUiDir: string): string | null {
  if (!isLocalFile(src)) return null;

  const fileName = `logo${extname(src) || ""}`;
  const relativePath = `assets/${fileName}`;
  for (const targetDir of [uiDir, adminUiDir]) {
    const assetsDir = join(targetDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    copyFileSync(src, join(assetsDir, fileName));
  }
  return relativePath;
}

function isLocalFile(src: string): boolean {
  if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith("data:")) return false;
  return isAbsolute(src) && existsSync(src) && statSync(src).isFile();
}
