/**
 * <ob-entity-detail entity="issues" record-id="5"> — Detail view for a single record.
 */
import { ObApi } from "./ob-api";
import { theme, reset, detail, button, card, form } from "../styles";
import { displayName, escapeAttr, escapeHtml, fieldLabel, formatValue, statusClass } from "../format";

export class ObEntityDetail extends HTMLElement {
  private _confirmDelete = false;
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
    const ops = api.getOperations(this.entity);

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

    const cols = Object.keys(schema.properties);
    const title = `${displayName(this.entity)} #${this.recordId}`;

    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${detail} ${button} ${card} ${form}
        .header-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
          padding-top: 18px;
          border-top: 1px solid var(--ob-border);
        }
        .delete-confirm {
          margin: 0 0 14px;
          padding: 10px 12px;
          border-radius: var(--ob-radius);
          background: var(--ob-danger-soft);
          color: var(--ob-danger);
          font-size: 13px;
          font-weight: 600;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--ob-bg-alt);
          color: var(--ob-text-muted);
          font-size: 12px;
          font-weight: 700;
        }
        .badge.success { background: var(--ob-success-soft); color: var(--ob-success); }
        .badge.warning { background: var(--ob-warning-soft); color: var(--ob-warning); }
        .badge.danger { background: var(--ob-danger-soft); color: var(--ob-danger); }
        @media (max-width: 720px) {
          .card-header { align-items: flex-start; flex-direction: column; }
          .header-actions, .header-actions button, .actions button { width: 100%; }
        }
      </style>
      <div class="card">
        <div class="card-header">
          <div>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <div class="header-actions">
            <button id="edit-btn" type="button">Edit</button>
            <button class="danger" id="delete-btn" type="button">${this._confirmDelete ? "Confirm Delete" : "Delete"}</button>
            ${this._confirmDelete ? `<button id="delete-cancel-btn">Cancel Delete</button>` : ""}
            <button id="back-btn" type="button">Back</button>
          </div>
        </div>
        ${this._confirmDelete ? `<div class="delete-confirm" role="alert">Confirm deletion of ${escapeHtml(title)}.</div>` : ""}
        ${this._deleteError ? `<div class="error-msg" role="alert">${escapeHtml(this._deleteError)}</div>` : ""}
        <dl>
          ${cols.map((c) => {
            const val = record[c] ?? "";
            return `<dt>${escapeHtml(fieldLabel(c))}</dt><dd>${this._renderValue(c, val, fks)}</dd>`;
          }).join("")}
        </dl>
        ${ops.length > 0 ? `
          <div class="actions">
            ${ops.map((op) => `
              <button class="secondary op-btn" type="button" data-op="${escapeAttr(op)}">${escapeHtml(displayOperation(op))}</button>
            `).join("")}
          </div>
          <div id="op-msg" class="status-line" role="status" aria-live="polite"></div>
        ` : ""}
      </div>
    `;

    this.shadowRoot!.getElementById("back-btn")?.addEventListener("click", () => {
      location.hash = `#/${this.entity}s`;
    });

    this.shadowRoot!.getElementById("edit-btn")?.addEventListener("click", () => {
      location.hash = `#/${this.entity}s/${this.recordId}/edit`;
    });

    this.shadowRoot!.getElementById("delete-btn")?.addEventListener("click", async () => {
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

    this.shadowRoot!.getElementById("delete-cancel-btn")?.addEventListener("click", async () => {
      this._confirmDelete = false;
      this._deleteError = "";
      await this._render();
    });

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>(".op-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._runOperation(btn.dataset.op || ""));
    });
  }

  private async _runOperation(op: string) {
    if (!op) return;
    const msg = this.shadowRoot!.getElementById("op-msg");
    const btn = this.shadowRoot!.querySelector<HTMLButtonElement>(`.op-btn[data-op="${op}"]`);
    if (!btn || !msg) return;

    btn.disabled = true;
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

  private _renderValue(column: string, value: unknown, fks: Record<string, string>): string {
    if (value === null || value === undefined || value === "") {
      return `<span class="muted">-</span>`;
    }

    if (fks[column]) {
      return `<a href="#/${fks[column]}s/${escapeAttr(value)}">#${escapeHtml(value)}</a>`;
    }

    const formatted = formatValue(column, value);
    if (column === "status" || ["active", "used", "revoked"].includes(column)) {
      return `<span class="badge ${statusClass(column, value)}">${escapeHtml(formatted)}</span>`;
    }
    return escapeHtml(formatted);
  }
}

function displayOperation(op: string): string {
  return op.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

customElements.define("ob-entity-detail", ObEntityDetail);
