/**
 * <ob-workflow-board workflow="issueWorkflow"> - Workflow-focused admin board.
 */
import { ObApi, type WorkflowScreen } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldDisplayLabel, formatValue, labelFor } from "../format";
import { stylesheetLink } from "../style-link";
import { displayOperation, operationAvailability } from "../workflow";

type WorkflowAction = {
  op: string;
  label: string;
  description: string;
  workflow: any;
  available: boolean;
  unavailableReason: string;
};

export class ObWorkflowBoard extends HTMLElement {
  private _confirmKey = "";
  private _message = "";
  private _error = "";
  private _loadError = "";
  private _loadingKey = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["workflow"];
  }

  async connectedCallback() {
    await this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) void this._render();
  }

  private get workflowId(): string {
    return this.getAttribute("workflow") || "";
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api || !this.workflowId) return;
    await api.ready();

    const screen = api.getWorkflowScreen(this.workflowId);
    if (!screen) {
      this.shadowRoot!.innerHTML = `
        ${stylesheetLink()}
        <div class="workflow-empty">Workflow screen is not available.</div>
      `;
      return;
    }

    if (!api.canCollection(screen.entity, "read")) {
      this.shadowRoot!.innerHTML = `
        ${stylesheetLink()}
        <section class="workflow-page" aria-labelledby="workflow-title">
          <div class="workflow-header">
            <div>
              <div class="eyebrow">Workflow</div>
              <h1 id="workflow-title">${escapeHtml(screen.label)}</h1>
            </div>
          </div>
          ${permissionNotice(api.permissionReason(screen.entity, "read") || "You do not have access to this workflow.")}
        </section>
      `;
      return;
    }

    const rows = await this._loadRows(api, screen);
    const lanes = this._lanes(api, screen, rows);

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <section class="workflow-page" aria-labelledby="workflow-title">
        <div class="workflow-header">
          <div>
            <div class="eyebrow">Workflow</div>
            <h1 id="workflow-title">${escapeHtml(screen.label)}</h1>
            ${screen.description ? `<p>${escapeHtml(screen.description)}</p>` : ""}
          </div>
          <a class="secondary" href="#/${escapeAttr(screen.entity)}s">View ${escapeHtml(displayName(screen.entity))} list</a>
        </div>
        ${this._message ? `<div class="success-msg" role="status">${escapeHtml(this._message)}</div>` : ""}
        ${this._loadError ? `<div class="error-msg" role="alert">${escapeHtml(this._loadError)}</div>` : ""}
        ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
        <div class="workflow-board" role="list" aria-label="${escapeAttr(screen.label)} board">
          ${lanes.map((lane) => this._renderLane(screen, lane.status, lane.rows, api)).join("")}
        </div>
      </section>
    `;

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-op][data-record-id]").forEach((button) => {
      button.addEventListener("click", () => {
        void this._runOperation(screen, button.dataset.recordId || "", button.dataset.op || "");
      });
    });
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-action=\"confirm-operation\"]").forEach((button) => {
      button.addEventListener("click", () => {
        void this._runOperation(screen, button.dataset.recordId || "", button.dataset.op || "", true);
      });
    });
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-action=\"cancel-operation\"]").forEach((button) => {
      button.addEventListener("click", async () => {
        this._confirmKey = "";
        await this._render();
      });
    });
  }

  private async _loadRows(api: ObApi, screen: WorkflowScreen): Promise<Record<string, unknown>[]> {
    try {
      const params = new URLSearchParams({ limit: "200", sort: "id", order: "asc" });
      const res = await api.request(`/api/${screen.entity}s?${params}`);
      if (!res.ok) {
        this._loadError = "Could not load workflow records.";
        return [];
      }
      const data = await res.json() as { items?: Record<string, unknown>[] };
      this._loadError = "";
      return data.items || [];
    } catch {
      this._loadError = "Could not load workflow records.";
      return [];
    }
  }

  private _lanes(api: ObApi, screen: WorkflowScreen, rows: Record<string, unknown>[]): Array<{ status: string; rows: Record<string, unknown>[] }> {
    const statuses = new Set<string>();
    for (const op of api.getWorkflowOperations(screen.entity, screen.id)) {
      const workflow = api.getOperationWorkflow(screen.entity, op) || {};
      for (const transition of workflow.transitions || []) {
        if (transition?.field?.field !== screen.statusField) continue;
        for (const value of transition.from || []) statuses.add(String(value));
        if (transition.to !== undefined && transition.to !== null) statuses.add(String(transition.to));
      }
    }
    for (const row of rows) statuses.add(String(row[screen.statusField] ?? ""));

    return [...statuses]
      .filter(Boolean)
      .map((status) => ({
        status,
        rows: rows.filter((row) => String(row[screen.statusField] ?? "") === status),
      }));
  }

  private _renderLane(screen: WorkflowScreen, status: string, rows: Record<string, unknown>[], api: ObApi): string {
    return `
      <section class="workflow-lane" role="listitem" aria-labelledby="lane-${escapeAttr(status)}">
        <div class="lane-header">
          <h2 id="lane-${escapeAttr(status)}">${escapeHtml(fieldDisplayLabel(status))}</h2>
          <span>${escapeHtml(rows.length)}</span>
        </div>
        <div class="lane-cards">
          ${rows.length === 0 ? `<div class="workflow-empty">No records.</div>` : rows.map((row) => this._renderCard(screen, row, api)).join("")}
        </div>
      </section>
    `;
  }

  private _renderCard(screen: WorkflowScreen, row: Record<string, unknown>, api: ObApi): string {
    const id = String(row.id || "");
    const actions = this._operationViews(api, screen, row);
    const pendingAction = actions.find((action) => this._operationKey(id, action.op) === this._confirmKey);
    return `
      <article class="workflow-card">
        <div class="card-main">
          <a class="card-title" href="#/${escapeAttr(screen.entity)}s/${escapeAttr(id)}">${escapeHtml(labelFor(row))}</a>
          <div class="card-meta">${this._cardMeta(row).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        </div>
        ${actions.length > 0 ? `
          <div class="card-actions">
            ${actions.map((action) => {
              const key = this._operationKey(id, action.op);
              const busy = key === this._loadingKey;
              return `<button type="button" class="secondary workflow-op" data-record-id="${escapeAttr(id)}" data-op="${escapeAttr(action.op)}" title="${escapeAttr(action.available ? action.description : action.unavailableReason)}" ${action.available && !busy ? "" : "disabled"}>${escapeHtml(busy ? "Working" : action.label)}</button>`;
            }).join("")}
          </div>
        ` : ""}
        ${pendingAction ? this._renderConfirmation(id, pendingAction) : ""}
      </article>
    `;
  }

  private _operationViews(api: ObApi, screen: WorkflowScreen, row: Record<string, unknown>): WorkflowAction[] {
    return api.getWorkflowOperations(screen.entity, screen.id).map((op) => {
      const policy = api.getOperationPolicy(screen.entity, op) || {};
      const workflow = api.getOperationWorkflow(screen.entity, op) || {};
      const label = policy.label || displayOperation(op);
      const availability = operationAvailability(row, workflow, label);
      return {
        op,
        label,
        description: policy.description || workflow.audit?.summary || "",
        workflow,
        available: availability.available,
        unavailableReason: availability.reason,
      };
    }).filter((action) => api.can(screen.entity, action.op, row));
  }

  private _renderConfirmation(id: string, action: WorkflowAction): string {
    const confirmation = action.workflow?.confirmation || {};
    const severity = confirmation.severity || "warning";
    const title = confirmation.title || `Confirm ${action.label}`;
    const message = confirmation.message || `Run ${action.label}?`;
    const confirmLabel = confirmation.confirmLabel || action.label;
    return `
      <div class="operation-confirm ${escapeAttr(severity)}" role="alert">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button type="button" class="primary" data-action="confirm-operation" data-record-id="${escapeAttr(id)}" data-op="${escapeAttr(action.op)}">${escapeHtml(confirmLabel)}</button>
          <button type="button" data-action="cancel-operation">Cancel</button>
        </div>
      </div>
    `;
  }

  private async _runOperation(screen: WorkflowScreen, recordId: string, op: string, confirmed = false) {
    if (!recordId || !op) return;
    const api = ObApi.instance;
    if (!api) return;
    const workflow = api.getOperationWorkflow(screen.entity, op);
    const key = this._operationKey(recordId, op);
    if (workflow?.confirmation?.required && !confirmed) {
      this._confirmKey = key;
      await this._render();
      return;
    }

    this._loadingKey = key;
    this._message = "";
    this._error = "";
    await this._render();

    try {
      const res = await api.request(`/api/${screen.entity}s/${recordId}/${op}`, { method: "POST" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Operation failed" }));
        this._error = error.error || "Operation failed";
      } else {
        const policy = api.getOperationPolicy(screen.entity, op) || {};
        this._message = `${policy.label || displayOperation(op)} completed.`;
        this._confirmKey = "";
      }
    } catch (error: any) {
      this._error = error.message || "Operation failed";
    } finally {
      this._loadingKey = "";
      await this._render();
    }
  }

  private _cardMeta(row: Record<string, unknown>): string[] {
    const fields = ["number", "type", "priority", "assignee_id", "creator_id", "project_id"];
    return fields
      .filter((field) => row[field] !== null && row[field] !== undefined && row[field] !== "")
      .map((field) => `${fieldDisplayLabel(field)}: ${formatValue(field, row[field])}`);
  }

  private _operationKey(recordId: string, op: string): string {
    return `${recordId}:${op}`;
  }
}

function permissionNotice(message: string): string {
  return `
    <div class="empty-state permission-state" role="status">
      <strong>Not available</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

customElements.define("ob-workflow-board", ObWorkflowBoard);
