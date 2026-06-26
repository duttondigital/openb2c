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
  type?: string;
  default?: unknown;
  format?: string;
  enum?: unknown[];
  "x-openb2c-relationship"?: {
    targetEntity?: string;
    targetField?: string;
    label?: string;
    description?: string;
    cardinality?: "one" | "many";
  };
  "x-openb2c-derived"?: {
    displayOnly?: boolean;
    dependencies?: unknown[];
    template?: string;
    expression?: unknown;
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

export function listFieldDisplayLabel(field: string, prop?: FieldSchema | null, primary = false): string {
  if (primary && field === "name") return "Name";
  return fieldDisplayLabel(field, prop);
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

export function isLongTextField(field: string, prop?: FieldSchema | null): boolean {
  return fieldFormat(prop) === "textarea" || ["description", "notes", "body", "content"].some((part) => field.includes(part));
}

export function isDerivedDisplayField(field: string, prop?: FieldSchema | null): boolean {
  if (!prop?.["x-openb2c-derived"]?.displayOnly) return false;
  return field === "display_name"
    || field === "display_title"
    || field === "display_label"
    || field.startsWith("display_")
    || field.endsWith("_display_title")
    || field.endsWith("_display_label");
}

export function listSchemaFields(schema: { properties?: Record<string, FieldSchema> } | null | undefined): [string, FieldSchema][] {
  return orderedSchemaFields(schema).filter(([field, prop]) => !isLongTextField(field, prop) && !isDerivedDisplayField(field, prop));
}

export function filterableSchemaFields(
  schema: { properties?: Record<string, FieldSchema> } | null | undefined,
  foreignKeys: Record<string, string> = {},
): [string, FieldSchema][] {
  return orderedSchemaFields(schema).filter(([field, prop]) => {
    if (isLongTextField(field, prop)) return false;
    if (foreignKeys[field]) return true;
    if (Array.isArray(prop.enum) && prop.enum.length > 0) return true;
    return false;
  });
}

export function labelFor(row: Record<string, unknown>): string {
  return String(row.name || row.email || row.reference || temporalSummaryFor(row) || `#${row.id}`);
}

function temporalSummaryFor(row: Record<string, unknown>): string {
  const start = firstPresent(row, ["starts_at", "start_at", "scheduled_at", "date"]);
  if (!start) return "";
  const time = firstPresent(row, ["time", "start_time", "starts_time"]);
  const formatted = String(start).includes("T")
    ? formatDateTime(start)
    : [formatDate(start), time ? formatTime(time) : ""].filter(Boolean).join(", ");
  return formatted;
}

function firstPresent(row: Record<string, unknown>, fields: string[]): unknown {
  for (const field of fields) {
    const value = row[field];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return "";
}

export function formatValue(field: string, value: unknown, prop?: FieldSchema | null): string {
  if (value === null || value === undefined || value === "") return "";

  const format = fieldFormat(prop);
  if (format === "date-time" || field.endsWith("_at")) return formatDateTime(value);
  if (format === "date" || field === "date" || field.endsWith("_date")) return formatDate(value);
  if (format === "time" || field === "time" || field.endsWith("_time")) return formatTime(value);

  if (isDurationMinutesField(field, prop)) {
    const minutes = Number(value);
    if (Number.isFinite(minutes)) return formatMinutes(minutes);
  }

  if ((field.endsWith("_pence") || format === "money") && typeof value === "number") {
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

function formatDate(value: unknown): string {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value: unknown): string {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatDateTime(value: unknown): string {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!match) return text;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isDurationMinutesField(field: string, prop?: FieldSchema | null): boolean {
  const format = fieldFormat(prop);
  return format === "duration-minutes"
    || field === "duration_mins"
    || field === "duration_minutes"
    || field.endsWith("_duration_mins")
    || field.endsWith("_duration_minutes");
}

function formatMinutes(value: number): string {
  const total = Math.round(value);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
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
