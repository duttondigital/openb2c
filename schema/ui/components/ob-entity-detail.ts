/**
 * <ob-entity-detail entity="issues" record-id="5"> — Detail view for a single record.
 */
import { ObApi } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldDisplayLabel, formatValue, labelFor, orderedSchemaFields, pluralDisplayName, statusClass } from "../format";
import { stylesheetLink } from "../style-link";

type OperationView = {
  op: string;
  label: string;
  description: string;
  workflow: any;
  available: boolean;
  unavailableReason: string;
};

type RelatedGroup = {
  entity: string;
  field: string;
  label: string;
  relationshipLabel: string;
  rows: any[];
  total: number;
};

export class ObEntityDetail extends HTMLElement {
  private _confirmDelete = false;
  private _confirmOperation = "";
  private _deleteError = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["entity", "record-id"];
  }

  async connectedCallback() {
    await this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  private get entity(): string {
    return this.getAttribute("entity") || "";
  }
  private get recordId(): string {
    return this.getAttribute("record-id") || "";
  }

  async _render() {
    const api = ObApi.instance;
    if (!api || !this.entity || !this.recordId) return;
    await api.ready();

    const schema = api.getSchema(this.entity);
    if (!schema) return;

    const fks = api.getForeignKeys(this.entity);

    let record: any;
    try {
      const res = await api.request(`/api/${this.entity}s/${this.recordId}`);
      if (!res.ok) {
        this.shadowRoot!.innerHTML = `<p>Not found</p>`;
        return;
      }
      record = await res.json();
    } catch {
      this.shadowRoot!.innerHTML = `<p>Failed to load</p>`;
      return;
    }

    const cols = orderedSchemaFields(schema);
    const title = `${displayName(this.entity)} #${this.recordId}`;
    const relatedGroups = await this._loadRelatedRecords(api, record);
    const operationViews = this._operationViews(api, record);
    const pendingOperation = operationViews.find((operation) => operation.op === this._confirmOperation);

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <div class="card">
        <div class="card-header">
          <div>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <div class="header-actions">
            <button type="button" data-action="edit">Edit</button>
            <button class="danger" type="button" data-action="delete">${this._confirmDelete ? "Confirm Delete" : "Delete"}</button>
            ${this._confirmDelete ? `<button type="button" data-action="cancel-delete">Cancel Delete</button>` : ""}
            <button type="button" data-action="back">Back</button>
          </div>
        </div>
        ${this._confirmDelete ? `<div class="delete-confirm" role="alert">Confirm deletion of ${escapeHtml(title)}.</div>` : ""}
        ${this._deleteError ? `<div class="error-msg" role="alert">${escapeHtml(this._deleteError)}</div>` : ""}
        <dl>
          ${cols.map(([c, prop]) => {
            const val = record[c] ?? "";
            return `<dt>${escapeHtml(fieldDisplayLabel(c, prop))}</dt><dd>${this._renderValue(c, val, fks, prop)}</dd>`;
          }).join("")}
        </dl>
        ${relatedGroups.length > 0 ? this._renderRelatedRecords(relatedGroups) : ""}
        ${operationViews.length > 0 ? `
          <section class="operation-section" aria-label="Available operations">
            <div class="section-title">Actions</div>
            <div class="actions">
            ${operationViews.map((operation) => `
              <button class="secondary op-btn" type="button" data-op="${escapeAttr(operation.op)}" title="${escapeAttr(operation.available ? operation.description : operation.unavailableReason)}" ${operation.available ? "" : "disabled"}>${escapeHtml(operation.label)}</button>
            `).join("")}
            </div>
            ${pendingOperation ? this._renderOperationConfirmation(pendingOperation) : ""}
            <div class="status-line" data-role="operation-status" role="status" aria-live="polite"></div>
          </section>
        ` : ""}
      </div>
    `;

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", () => {
      location.hash = `#/${this.entity}s`;
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="edit"]')?.addEventListener("click", () => {
      location.hash = `#/${this.entity}s/${this.recordId}/edit`;
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", async () => {
      if (!this._confirmDelete) {
        this._confirmDelete = true;
        await this._render();
        return;
      }
      const api = ObApi.instance!;
      const res = await api.request(`/api/${this.entity}s/${this.recordId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        this._deleteError = err.error || "Delete failed";
        this._confirmDelete = false;
        await this._render();
        return;
      }
      location.hash = `#/${this.entity}s`;
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')?.addEventListener("click", async () => {
      this._confirmDelete = false;
      this._deleteError = "";
      await this._render();
    });

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>(".op-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._runOperation(btn.dataset.op || ""));
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="confirm-operation"]')?.addEventListener("click", () => {
      this._runOperation(this._confirmOperation, true);
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="cancel-operation"]')?.addEventListener("click", async () => {
      this._confirmOperation = "";
      await this._render();
    });
  }

  private _operationViews(api: ObApi, record: Record<string, unknown>): OperationView[] {
    const groups = api.spec?.["x-openb2c-workflows"]?.groups || {};
    return api.getOperations(this.entity).map((op) => {
      const policy = api.getOperationPolicy(this.entity, op) || {};
      const workflow = api.getOperationWorkflow(this.entity, op) || {};
      const group = workflow.group ? groups[workflow.group] : null;
      const label = policy.label || displayOperation(op);
      const availability = operationAvailability(record, workflow, label);
      const description = policy.description || workflow.audit?.summary || group?.description || group?.label || "";
      return {
        op,
        label,
        description,
        workflow,
        available: availability.available,
        unavailableReason: availability.reason,
      };
    });
  }

  private async _loadRelatedRecords(api: ObApi, record: Record<string, unknown>): Promise<RelatedGroup[]> {
    const id = record.id ?? this.recordId;
    const groups: RelatedGroup[] = [];
    const candidates: Array<{ entity: string; field: string; relationship: any }> = [];

    for (const entity of api.getAllEntities()) {
      if (entity === this.entity || api.isInternalEntity(entity)) continue;
      const relationships = api.getForeignKeyRelationships(entity);
      for (const [field, relationship] of Object.entries(relationships)) {
        if ((relationship as any).targetEntity === this.entity) {
          candidates.push({ entity, field, relationship });
        }
      }
    }

    await Promise.all(candidates.map(async ({ entity, field, relationship }) => {
      try {
        const params = new URLSearchParams({
          [field]: String(id),
          limit: "5",
          sort: "id",
          order: "desc",
        });
        const res = await api.request(`/api/${entity}s?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const rows = data.items || [];
        if (rows.length === 0) return;
        groups.push({
          entity,
          field,
          label: pluralDisplayName(entity),
          relationshipLabel: relationship.label || fieldDisplayLabel(field),
          rows,
          total: data.total || rows.length,
        });
      } catch {
        // Related records are progressive context; the primary record remains usable if one query fails.
      }
    }));

    return groups.sort((a, b) => a.label.localeCompare(b.label));
  }

  private _renderRelatedRecords(groups: RelatedGroup[]): string {
    return `
      <section class="related-section" aria-label="Related records">
        <div class="section-title">Related records</div>
        <div class="related-grid">
          ${groups.map((group) => `
            <section class="related-group" aria-label="${escapeAttr(group.label)}">
              <div class="related-header">
                <div>
                  <h2>${escapeHtml(group.label)}</h2>
                  <p>${escapeHtml(group.total)} related via ${escapeHtml(group.relationshipLabel)}</p>
                </div>
                <a href="${escapeAttr(relatedListHref(group))}">View all</a>
              </div>
              <div class="related-list">
                ${group.rows.map((row) => `
                  <a class="related-row" href="#/${escapeAttr(group.entity)}s/${escapeAttr(row.id)}">
                    <span>${escapeHtml(labelFor(row))}</span>
                    <strong>#${escapeHtml(row.id)}</strong>
                  </a>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </section>
    `;
  }

  private _renderOperationConfirmation(operation: { op: string; label: string; workflow: any }): string {
    const confirmation = operation.workflow?.confirmation || {};
    const severity = confirmation.severity || "warning";
    const title = confirmation.title || `Confirm ${operation.label}`;
    const message = confirmation.message || `Run ${operation.label}?`;
    const confirmLabel = confirmation.confirmLabel || operation.label;
    return `
      <div class="operation-confirm ${escapeAttr(severity)}" role="alert">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="confirm-actions">
          <button class="primary" type="button" data-action="confirm-operation">${escapeHtml(confirmLabel)}</button>
          <button type="button" data-action="cancel-operation">Cancel</button>
        </div>
      </div>
    `;
  }

  private async _runOperation(op: string, confirmed = false) {
    if (!op) return;
    const workflow = ObApi.instance?.getOperationWorkflow(this.entity, op);
    if (workflow?.confirmation?.required && !confirmed) {
      this._confirmOperation = op;
      await this._render();
      return;
    }

    const msg = this.shadowRoot!.querySelector<HTMLElement>('[data-role="operation-status"]');
    const btn = this.shadowRoot!.querySelector<HTMLButtonElement>(`.op-btn[data-op="${op}"]`);
    if (!btn || !msg) return;

    btn.disabled = true;
    this._confirmOperation = "";
    msg.textContent = "";
    msg.style.color = "var(--ob-text-muted)";

    try {
      const res = await ObApi.instance!.request(`/api/${this.entity}s/${this.recordId}/${op}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        msg.textContent = err.error || "Failed";
        msg.style.color = "var(--ob-danger)";
        return;
      }
      await this._render();
    } catch (e: any) {
      msg.textContent = e.message || "Failed";
      msg.style.color = "var(--ob-danger)";
    } finally {
      btn.disabled = false;
    }
  }

  private _renderValue(column: string, value: unknown, fks: Record<string, string>, prop: any): string {
    if (value === null || value === undefined || value === "") {
      return `<span class="muted">-</span>`;
    }

    if (fks[column]) {
      return `<a href="#/${fks[column]}s/${escapeAttr(value)}">#${escapeHtml(value)}</a>`;
    }

    const formatted = formatValue(column, value, prop);
    if (column === "status" || ["active", "used", "revoked"].includes(column)) {
      return `<span class="badge ${statusClass(column, value)}">${escapeHtml(formatted)}</span>`;
    }
    return escapeHtml(formatted);
  }
}

function displayOperation(op: string): string {
  return op.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relatedListHref(group: RelatedGroup): string {
  const params = new URLSearchParams({ [group.field]: String(group.rows[0]?.[group.field] ?? "") });
  return `#/${group.entity}s?${params}`;
}

function operationAvailability(record: Record<string, unknown>, workflow: any, label: string): { available: boolean; reason: string } {
  const transitions = workflow?.transitions || [];
  for (const transition of transitions) {
    const field = transition?.field?.field;
    if (!field) continue;
    const current = record[field];
    const from = transition.from || [];
    if (from.length > 0 && !from.map(String).includes(String(current))) {
      return {
        available: false,
        reason: `${label} is unavailable while ${fieldDisplayLabel(field)} is ${String(current || "unset")}.`,
      };
    }
  }
  const precondition = evaluatePrecondition(record, workflow?.preconditions?.expression);
  if (precondition === false) {
    return {
      available: false,
      reason: `${label} is unavailable for this record.`,
    };
  }
  return { available: true, reason: "" };
}

function evaluatePrecondition(record: Record<string, unknown>, expr: any): boolean | null {
  if (!expr) return true;
  if (expr._t === "lit") return Boolean(expr.value);
  if (expr._t === "field") {
    const value = guardValue(record, expr);
    return value.known ? Boolean(value.value) : null;
  }
  if (expr._t === "bin") {
    const op = String(expr.op || "");
    if (op === "&&") return booleanAnd(evaluatePrecondition(record, expr.left), evaluatePrecondition(record, expr.right));
    if (op === "||") return booleanOr(evaluatePrecondition(record, expr.left), evaluatePrecondition(record, expr.right));

    const left = guardValue(record, expr.left);
    const right = guardValue(record, expr.right);
    if (!left.known || !right.known) return null;
    switch (op) {
      case "==": return left.value === right.value;
      case "!=": return left.value !== right.value;
      case "<": return Number(left.value) < Number(right.value);
      case "<=": return Number(left.value) <= Number(right.value);
      case ">": return Number(left.value) > Number(right.value);
      case ">=": return Number(left.value) >= Number(right.value);
      default: return null;
    }
  }
  if (expr._t === "un") {
    if (expr.op === "!") {
      const value = evaluatePrecondition(record, expr.arg);
      return value === null ? null : !value;
    }
    const value = guardValue(record, expr.arg);
    if (!value.known) return null;
    if (expr.op === "isNull") return value.value === null;
    if (expr.op === "notNull") return value.value !== null;
  }
  return null;
}

function guardValue(record: Record<string, unknown>, expr: any): { known: boolean; value?: unknown } {
  if (!expr) return { known: false };
  if (expr._t === "lit") return { known: true, value: expr.value };
  if (expr._t === "field") {
    const name = String(expr.name || "");
    if (!Object.prototype.hasOwnProperty.call(record, name)) return { known: false };
    return { known: true, value: record[name] };
  }
  const booleanValue = evaluatePrecondition(record, expr);
  return booleanValue === null ? { known: false } : { known: true, value: booleanValue };
}

function booleanAnd(left: boolean | null, right: boolean | null): boolean | null {
  if (left === false || right === false) return false;
  if (left === true && right === true) return true;
  return null;
}

function booleanOr(left: boolean | null, right: boolean | null): boolean | null {
  if (left === true || right === true) return true;
  if (left === false && right === false) return false;
  return null;
}

customElements.define("ob-entity-detail", ObEntityDetail);
