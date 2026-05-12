export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bApi\b/g, "API");
}

export function displayName(entity: string): string {
  return titleCase(entity);
}

export function pluralDisplayName(entity: string): string {
  return `${displayName(entity)}s`;
}

export function fieldLabel(field: string): string {
  if (field === "id") return "ID";
  if (field.endsWith("_id")) return titleCase(field.slice(0, -3));
  if (field.endsWith("_pence")) return `${titleCase(field.slice(0, -6))} GBP`;
  return titleCase(field);
}

export type FieldSchema = {
  title?: string;
  description?: string;
  format?: string;
  enum?: unknown[];
  "x-openb2c-relationship"?: {
    targetEntity?: string;
    targetField?: string;
    label?: string;
    description?: string;
    cardinality?: "one" | "many";
    targetLabel?: {
      entity?: string;
      field?: string;
    };
  };
  "x-openb2c-field"?: {
    label?: string;
    helpText?: string;
    placeholder?: string;
    format?: string;
    displayPriority?: number;
    privacy?: "public" | "internal" | "sensitive" | "secret";
    redact?: boolean;
  };
};

export function fieldMetadata(prop?: FieldSchema | null): FieldSchema["x-openb2c-field"] {
  return prop?.["x-openb2c-field"] || {};
}

export function fieldDisplayLabel(field: string, prop?: FieldSchema | null): string {
  return fieldMetadata(prop).label || prop?.title || fieldLabel(field);
}

export function fieldHelpText(prop?: FieldSchema | null): string {
  return fieldMetadata(prop).helpText || prop?.description || "";
}

export function fieldPlaceholder(prop?: FieldSchema | null): string {
  return fieldMetadata(prop).placeholder || "";
}

export function fieldFormat(prop?: FieldSchema | null): string {
  return fieldMetadata(prop).format || prop?.format || "";
}

export function fieldRelationship(prop?: FieldSchema | null): FieldSchema["x-openb2c-relationship"] {
  return prop?.["x-openb2c-relationship"] || {};
}

export function isRedactedField(prop?: FieldSchema | null): boolean {
  const metadata = fieldMetadata(prop);
  return Boolean(metadata.redact || metadata.privacy === "secret");
}

export function orderedSchemaFields(schema: { properties?: Record<string, FieldSchema> } | null | undefined): [string, FieldSchema][] {
  return Object.entries(schema?.properties || {})
    .map(([name, prop], index) => ({ name, prop, index, priority: fieldMetadata(prop).displayPriority }))
    .filter(({ prop }) => !isRedactedField(prop))
    .sort((a, b) => {
      const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
      return aPriority - bPriority || a.index - b.index;
    })
    .map(({ name, prop }) => [name, prop] as [string, FieldSchema]);
}

export function labelFor(row: Record<string, unknown>): string {
  return String(row.title || row.name || row.email || row.reference || `#${row.id}`);
}

export function formatValue(field: string, value: unknown, prop?: FieldSchema | null): string {
  if (value === null || value === undefined || value === "") return "";

  if ((field.endsWith("_pence") || fieldFormat(prop) === "money") && typeof value === "number") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(value / 100);
  }

  if (["active", "used", "revoked"].includes(field) && (value === 0 || value === 1)) {
    return value === 1 ? "Yes" : "No";
  }

  return String(value);
}

export function statusClass(field: string, value: unknown): string {
  const normalized = String(value ?? "").toLowerCase();
  if (["active", "paid", "confirmed", "completed", "scheduled", "yes"].includes(normalized)) return "success";
  if (["pending", "reserved", "draft", "issued"].includes(normalized)) return "warning";
  if (["cancelled", "canceled", "failed", "expired", "revoked", "no"].includes(normalized)) return "danger";
  if (field === "active" && value === 1) return "success";
  if (field === "active" && value === 0) return "danger";
  return "";
}
