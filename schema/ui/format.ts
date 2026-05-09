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

export function labelFor(row: Record<string, unknown>): string {
  return String(row.title || row.name || row.email || row.reference || `#${row.id}`);
}

export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (field.endsWith("_pence") && typeof value === "number") {
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
