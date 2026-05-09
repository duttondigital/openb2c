/**
 * <ob-entity-detail entity="issues" record-id="5"> — Detail view for a single record.
 */
import { ObApi } from "./ob-api";
import { theme, reset, detail, button, card } from "../styles";

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

    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${detail} ${button} ${card}
        .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
      </style>
      <div class="card">
        <div class="card-header">
          <h2>${displayName(this.entity)} #${this.recordId}</h2>
          <div style="display:flex;gap:8px">
            <button id="edit-btn">Edit</button>
            <button class="danger" id="delete-btn">${this._confirmDelete ? "Confirm Delete" : "Delete"}</button>
            ${this._confirmDelete ? `<button id="delete-cancel-btn">Cancel Delete</button>` : ""}
            <button id="back-btn">← Back</button>
          </div>
        </div>
        ${this._deleteError ? `<div style="color:var(--ob-danger);font-size:13px;margin-bottom:12px">${this._deleteError}</div>` : ""}
        <dl>
          ${cols.map((c) => {
            const val = record[c] ?? "";
            let display: string;
            if (fks[c] && val) {
              display = `<a href="#/${fks[c]}s/${val}">${val}</a>`;
            } else {
              display = String(val);
            }
            return `<dt>${c}</dt><dd>${display}</dd>`;
          }).join("")}
        </dl>
        ${ops.length > 0 ? `
          <div class="actions">
            ${ops.map((op) => `
              <button class="primary op-btn" data-op="${op}">${displayOperation(op)}</button>
            `).join("")}
          </div>
          <div id="op-msg" style="font-size:13px;margin-top:8px"></div>
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
}

function displayName(entity: string): string {
  return entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayOperation(op: string): string {
  return op.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

customElements.define("ob-entity-detail", ObEntityDetail);
