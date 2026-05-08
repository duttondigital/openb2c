/**
 * <ob-entity-form entity="issues" mode="create|edit" record-id="5">
 * Derives form fields from OpenAPI spec.
 */
import { ObApi } from "./ob-api";
import { theme, reset, form, button, card } from "../styles";

export class ObEntityForm extends HTMLElement {
  private _error = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["entity", "mode", "record-id"];
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
  private get mode(): "create" | "edit" {
    return (this.getAttribute("mode") as any) || "create";
  }
  private get recordId(): string {
    return this.getAttribute("record-id") || "";
  }

  async _render() {
    const api = ObApi.instance;
    if (!api || !this.entity) return;
    await api.ready();

    const inputSchema = api.getInputSchema(this.entity);
    if (!inputSchema) return;

    const fks = api.getForeignKeys(this.entity);
    const required = new Set(inputSchema.required || []);
    const fields = Object.entries(inputSchema.properties as Record<string, any>);

    // Load existing record for edit mode
    let record: any = {};
    if (this.mode === "edit" && this.recordId) {
      try {
        const res = await api.request(`/api/${this.entity}s/${this.recordId}`);
        record = await res.json();
      } catch { /* empty */ }
    }

    // Load FK options
    const fkOptions: Record<string, any[]> = {};
    for (const [col, ref] of Object.entries(fks)) {
      try {
        const res = await api.request(`/api/${ref}s?limit=200`);
        const data = await res.json();
        fkOptions[col] = data.items || [];
      } catch {
        fkOptions[col] = [];
      }
    }

    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${form} ${button} ${card}</style>
      <div class="card">
        <div class="card-header">
          <h2>${this.mode === "edit" ? "Edit" : "New"} ${displayName(this.entity)}</h2>
          <button id="back-btn">← Back</button>
        </div>
        ${this._error ? `<div class="error-msg">${this._error}</div>` : ""}
        <form>
          ${fields.map(([name, prop]) => {
            const req = required.has(name);
            const val = record[name] ?? prop.default ?? "";

            if (fks[name]) {
              const opts = fkOptions[name] || [];
              return `
                <div class="form-group">
                  <label>${name}${req ? ' <span class="required">*</span>' : ""}</label>
                  <select name="${name}" ${req ? "required" : ""}>
                    <option value="">-- select --</option>
                    ${opts.map((o: any) => {
                      const label = o.name || o.title || o.email || o.key || `#${o.id}`;
                      return `<option value="${o.id}" ${String(o.id) === String(val) ? "selected" : ""}>${label} (${o.id})</option>`;
                    }).join("")}
                  </select>
                </div>`;
            }

            const inputType = prop.type === "integer" ? "number" : "text";
            return `
              <div class="form-group">
                <label>${name}${req ? ' <span class="required">*</span>' : ""}</label>
                <input type="${inputType}" name="${name}" value="${val}" ${req ? "required" : ""} />
              </div>`;
          }).join("")}
          <div style="display:flex;gap:8px;margin-top:20px">
            <button type="submit" class="primary">${this.mode === "edit" ? "Save" : "Create"}</button>
            <button type="button" id="cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    `;

    this.shadowRoot!.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });

    const goBack = () => {
      if (this.mode === "edit" && this.recordId) {
        location.hash = `#/${this.entity}s/${this.recordId}`;
      } else {
        location.hash = `#/${this.entity}s`;
      }
    };
    this.shadowRoot!.getElementById("back-btn")?.addEventListener("click", goBack);
    this.shadowRoot!.getElementById("cancel-btn")?.addEventListener("click", goBack);
  }

  private async _submit() {
    const formEl = this.shadowRoot!.querySelector("form")!;
    const data: Record<string, any> = {};
    const formData = new FormData(formEl);
    const inputSchema = ObApi.instance!.getInputSchema(this.entity)!;

    for (const [key, value] of formData.entries()) {
      const v = String(value);
      if (v === "") continue;
      const prop = inputSchema.properties[key];
      data[key] = prop?.type === "integer" ? Number(v) : v;
    }

    try {
      const api = ObApi.instance!;
      const path = this.mode === "edit"
        ? `/api/${this.entity}s/${this.recordId}`
        : `/api/${this.entity}s`;
      const method = this.mode === "edit" ? "PUT" : "POST";
      const res = await api.request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Request failed";
        this._render();
        return;
      }

      const result = await res.json();
      location.hash = `#/${this.entity}s/${result.id || this.recordId}`;
    } catch (e: any) {
      this._error = e.message;
      this._render();
    }
  }
}

function displayName(entity: string): string {
  return entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

customElements.define("ob-entity-form", ObEntityForm);
