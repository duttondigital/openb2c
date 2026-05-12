/**
 * <ob-entity-form entity="issues" mode="create|edit" record-id="5">
 * Derives form fields from OpenAPI spec.
 */
import { ObApi } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldDisplayLabel, fieldFormat, fieldHelpText, fieldPlaceholder, labelFor, orderedSchemaFields } from "../format";
import { stylesheetLink } from "../style-link";

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
    const relationships = api.getForeignKeyRelationships(this.entity);
    const required = new Set(inputSchema.required || []);
    const fields = orderedSchemaFields(inputSchema);

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
      ${stylesheetLink()}
      <div class="card">
        <div class="card-header">
          <div>
            <h1>${this.mode === "edit" ? "Edit" : "New"} ${escapeHtml(displayName(this.entity))}</h1>
          </div>
          <button type="button" data-action="back">Back</button>
        </div>
        ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
        <form>
          <div class="form-grid">
          ${fields.map(([name, prop]) => {
            const req = required.has(name);
            const val = record[name] ?? prop.default ?? "";
            const id = `field-${name}`;
            const label = fieldDisplayLabel(name, prop);
            const help = fieldHelpText(prop);
            const describedBy = help ? `${id}-help` : "";
            const describedByAttr = describedBy ? ` aria-describedby="${escapeAttr(describedBy)}"` : "";
            const helpMarkup = help ? `<div class="help-text" id="${escapeAttr(describedBy)}">${escapeHtml(help)}</div>` : "";
            const full = isWideField(name, prop) ? " full" : "";

            if (fks[name]) {
              const opts = fkOptions[name] || [];
              const relationship = relationships[name];
              return `
                <div class="form-group${full}">
                  <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                  <select id="${escapeAttr(id)}" name="${escapeAttr(name)}"${describedByAttr} ${req ? "required" : ""}>
                    <option value="">Select ${escapeHtml(label.toLowerCase())}</option>
                    ${opts.map((o: any) => {
                      const optionLabel = relationshipLabelFor(o, relationship);
                      return `<option value="${escapeAttr(o.id)}" ${String(o.id) === String(val) ? "selected" : ""}>${escapeHtml(optionLabel)} (${escapeHtml(o.id)})</option>`;
                    }).join("")}
                  </select>
                  ${helpMarkup}
                </div>`;
            }

            if (Array.isArray(prop.enum) && prop.enum.length > 0) {
              return `
                <div class="form-group${full}">
                  <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                  <select id="${escapeAttr(id)}" name="${escapeAttr(name)}"${describedByAttr} ${req ? "required" : ""}>
                    <option value="">Select ${escapeHtml(label.toLowerCase())}</option>
                    ${prop.enum.map((choice: unknown) => `<option value="${escapeAttr(choice)}" ${String(choice) === String(val) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
                  </select>
                  ${helpMarkup}
                </div>`;
            }

            const inputAttrs = inputAttrsFor(name, prop);
            const validationAttrs = validationAttrsFor(prop);
            const placeholder = fieldPlaceholder(prop);
            const placeholderAttr = placeholder ? ` placeholder="${escapeAttr(placeholder)}"` : "";
            if (isWideField(name, prop)) {
              return `
                <div class="form-group full">
                  <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                  <textarea id="${escapeAttr(id)}" name="${escapeAttr(name)}"${describedByAttr}${placeholderAttr}${validationAttrs} ${req ? "required" : ""}>${escapeHtml(val)}</textarea>
                  ${helpMarkup}
                </div>`;
            }

            return `
              <div class="form-group${full}">
                <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                <input id="${escapeAttr(id)}" ${inputAttrs} name="${escapeAttr(name)}" value="${escapeAttr(val)}"${describedByAttr}${placeholderAttr}${validationAttrs} ${req ? "required" : ""} />
                ${helpMarkup}
              </div>`;
          }).join("")}
          </div>
          <div class="actions">
            <button type="submit" class="primary">${this.mode === "edit" ? "Save" : "Create"}</button>
            <button type="button" data-action="cancel">Cancel</button>
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
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", goBack);
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", goBack);
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
      data[key] = prop?.type === "integer" || prop?.type === "number" ? Number(v) : v;
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

function inputAttrsFor(name: string, prop: any): string {
  const format = fieldFormat(prop);
  if (prop.type === "integer") return 'type="text" inputmode="numeric"';
  if (prop.type === "number") return 'type="text" inputmode="decimal"';
  if (format === "email" || name === "email" || name.endsWith("_email")) return 'type="text" inputmode="email" autocomplete="email"';
  if (format === "date" || name === "date" || name.endsWith("_date")) return `type="text" inputmode="numeric"${fieldPlaceholder(prop) ? "" : ' placeholder="YYYY-MM-DD"'}`;
  if (format === "time" || name === "time" || name.endsWith("_time")) return `type="text" inputmode="numeric"${fieldPlaceholder(prop) ? "" : ' placeholder="HH:MM"'}`;
  if (format === "phone" || name.includes("phone")) return 'type="text" inputmode="tel" autocomplete="tel"';
  if (format === "url" || name.includes("url")) return 'type="text" inputmode="url"';
  return 'type="text"';
}

function validationAttrsFor(prop: any): string {
  const attrs: string[] = [];
  if (prop.minLength !== undefined) attrs.push(`minlength="${escapeAttr(prop.minLength)}"`);
  if (prop.maxLength !== undefined) attrs.push(`maxlength="${escapeAttr(prop.maxLength)}"`);
  if (prop.minimum !== undefined) attrs.push(`min="${escapeAttr(prop.minimum)}"`);
  if (prop.maximum !== undefined) attrs.push(`max="${escapeAttr(prop.maximum)}"`);
  if (prop.pattern) attrs.push(`pattern="${escapeAttr(prop.pattern)}"`);
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function isWideField(name: string, prop?: any): boolean {
  return fieldFormat(prop) === "textarea" || ["description", "notes", "body", "content"].some((part) => name.includes(part));
}

function relationshipLabelFor(row: Record<string, unknown>, relationship: any): string {
  const targetField = relationship?.targetLabel?.field;
  if (targetField && row[targetField] !== undefined && row[targetField] !== null && row[targetField] !== "") {
    return String(row[targetField]);
  }
  return labelFor(row);
}

customElements.define("ob-entity-form", ObEntityForm);
