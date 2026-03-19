/**
 * <ob-entity-detail entity="issues" record-id="5"> — Detail view for a single record.
 */
import { ObApi } from "./ob-api";
import { theme, reset, detail, button, card } from "../styles";

export class ObEntityDetail extends HTMLElement {
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
      const res = await fetch(api.url(`/api/${this.entity}s/${this.recordId}`));
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
            <button class="danger" id="delete-btn">Delete</button>
            <button id="back-btn">← Back</button>
          </div>
        </div>
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
            ${ops.map((op) => `<ob-operation-btn entity="${this.entity}" op="${op}" record-id="${this.recordId}"></ob-operation-btn>`).join("")}
          </div>
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
      if (!confirm(`Delete ${this.entity} #${this.recordId}?`)) return;
      const api = ObApi.instance!;
      await fetch(api.url(`/api/${this.entity}s/${this.recordId}`), { method: "DELETE" });
      location.hash = `#/${this.entity}s`;
    });

    // Listen for operation success to refresh
    this.addEventListener("ob-operation-done", () => this._render());
  }
}

function displayName(entity: string): string {
  return entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

customElements.define("ob-entity-detail", ObEntityDetail);
