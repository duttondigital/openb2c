import type { AppMetadata, OrganizationMetadata } from "./types";

export const TS_TYPE_MAP: Record<string, string> = {
  integer: "number",
  text: "string",
  real: "number",
  blob: "Uint8Array",
};

export function pascalCase(s: string): string {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

export function camelCase(s: string): string {
  return s.replace(/_(\w)/g, (_, c) => c.toUpperCase());
}

export function quoteReserved(name: string): string {
  // SQLite reserved words that need quoting
  const reserved = ["transaction", "order", "group", "index"];
  return reserved.includes(name.toLowerCase()) ? `[${name}]` : name;
}

export const DEFAULT_ORGANIZATION_METADATA: OrganizationMetadata = {
  name: "OpenB2C",
  description: "Generated OpenB2C organization",
};

export const SYSTEM_DEFAULT_VERSION = "0.1.0";

export const SYSTEM_DEFAULT_PORTS = {
  server: 3085,
  mcp: 3086,
};

type PartialOrganizationMetadata = Partial<OrganizationMetadata>;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeSlug(value: string): string {
  return slugify(value) || slugify(DEFAULT_ORGANIZATION_METADATA.name);
}

export function getAppMetadata(schema: {
  organization?: PartialOrganizationMetadata;
}): AppMetadata {
  const organization = { ...DEFAULT_ORGANIZATION_METADATA, ...(schema.organization ?? {}) };
  const name = organization.name.trim() || DEFAULT_ORGANIZATION_METADATA.name;
  const slug = safeSlug(name);

  return {
    name,
    slug,
    apiTitle: `${name} API`,
    description: organization.description,
    version: SYSTEM_DEFAULT_VERSION,
    defaultPorts: SYSTEM_DEFAULT_PORTS,
    uiTitle: name,
  };
}

export function getDefaultDatabasePath(app: AppMetadata): string {
  return `${safeSlug(app.slug)}.db`;
}
