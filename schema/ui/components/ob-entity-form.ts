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
    return ["entity", "mode", "record-id", "defaults", "return-to"];
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
  private get defaults(): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(this.getAttribute("defaults") || ""));
  }
  private get returnTo(): string {
    return this.getAttribute("return-to") || "";
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
    const fields = orderedSchemaFields(inputSchema).filter(([name]) => !isSystemTimestampField(name));
    const defaults = this.defaults;
    const defaultLockedFields = new Set(Object.keys(defaults));
    const lifecycleLockedFields = lifecycleControlledFields(api, this.entity);
    const lockedFields = new Set([...defaultLockedFields, ...lifecycleLockedFields]);

    // Load existing record for edit mode
    let record: any = { ...defaults };
    if (this.mode === "edit" && this.recordId) {
      try {
        const res = await api.request(`/api/${this.entity}s/${this.recordId}`);
        record = { ...await res.json(), ...defaults };
      } catch { /* empty */ }
    }

    const allowed = this.mode === "edit"
      ? api.can(this.entity, "update", record)
      : api.canCollection(this.entity, "create");
    if (!allowed) {
      this.shadowRoot!.innerHTML = `
        ${stylesheetLink()}
        <div class="card">
          <div class="card-header">
            <h1>${this.mode === "edit" ? "Edit" : "New"} ${escapeHtml(displayName(this.entity))}</h1>
            <button type="button" data-action="back">Back</button>
          </div>
          ${permissionNotice(api.permissionReason(this.entity, this.mode === "edit" ? "update" : "create") || "You do not have permission to use this form.")}
        </div>
      `;
      this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", () => {
        location.hash = this._backTarget();
      });
      return;
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
            const val = formDisplayValue(name, prop, record[name] ?? prop.default ?? "");
            const locked = lockedFields.has(name);
            const id = `field-${name}`;
            const label = fieldDisplayLabel(name, prop);
            const help = fieldHelpText(prop);
            const describedBy = help ? `${id}-help` : "";
            const describedByAttr = describedBy ? ` aria-describedby="${escapeAttr(describedBy)}"` : "";
            const helpMarkup = help ? `<div class="help-text" id="${escapeAttr(describedBy)}">${escapeHtml(help)}</div>` : "";
            const lockedHelp = lifecycleLockedFields.has(name) ? "Managed by workflow actions." : "Set by the current workspace.";
            const lockedMarkup = locked ? `${defaultLockedFields.has(name) ? `<input type="hidden" name="${escapeAttr(name)}" value="${escapeAttr(val)}" />` : ""}<div class="help-text">${escapeHtml(lockedHelp)}</div>` : "";
            const full = isWideField(name, prop) ? " full" : "";

            if (fks[name]) {
              const opts = fkOptions[name] || [];
              const relationship = relationships[name];
              return `
                <div class="form-group${full}">
                  <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                  <select id="${escapeAttr(id)}" name="${escapeAttr(name)}"${describedByAttr} ${req ? "required" : ""} ${locked ? "disabled" : ""}>
                    <option value="">Select ${escapeHtml(label.toLowerCase())}</option>
                    ${opts.map((o: any) => {
                      const optionLabel = relationshipLabelFor(o, relationship);
                      return `<option value="${escapeAttr(o.id)}" ${String(o.id) === String(val) ? "selected" : ""}>${escapeHtml(optionLabel)} (${escapeHtml(o.id)})</option>`;
                    }).join("")}
                  </select>
                  ${helpMarkup}${lockedMarkup}
                </div>`;
            }

            if (Array.isArray(prop.enum) && prop.enum.length > 0) {
              return `
                <div class="form-group${full}">
                  <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                  <select id="${escapeAttr(id)}" name="${escapeAttr(name)}"${describedByAttr} ${req ? "required" : ""} ${locked ? "disabled" : ""}>
                    <option value="">Select ${escapeHtml(label.toLowerCase())}</option>
                    ${prop.enum.map((choice: unknown) => `<option value="${escapeAttr(choice)}" ${String(choice) === String(val) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
                  </select>
                  ${helpMarkup}${lockedMarkup}
                </div>`;
            }

            const inputAttrs = inputAttrsFor(name, prop);
            const validationAttrs = validationAttrsFor(name, prop);
            const placeholder = fieldPlaceholder(prop) || defaultPlaceholderFor(name, prop);
            const placeholderAttr = placeholder ? ` placeholder="${escapeAttr(placeholder)}"` : "";
            if (isWideField(name, prop)) {
              return `
                <div class="form-group full">
                  <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                  <textarea id="${escapeAttr(id)}" name="${escapeAttr(name)}"${describedByAttr}${placeholderAttr}${validationAttrs} ${req ? "required" : ""} ${locked ? "disabled" : ""}>${escapeHtml(val)}</textarea>
                  ${helpMarkup}${lockedMarkup}
                </div>`;
            }

            return `
              <div class="form-group${full}">
                <label for="${escapeAttr(id)}">${escapeHtml(label)}${req ? ' <span class="required">*</span>' : ""}</label>
                <input id="${escapeAttr(id)}" ${inputAttrs} name="${escapeAttr(name)}" value="${escapeAttr(val)}"${describedByAttr}${placeholderAttr}${validationAttrs} ${req ? "required" : ""} ${locked ? "disabled" : ""} />
                ${helpMarkup}${lockedMarkup}
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

    const goBack = () => { location.hash = this._backTarget(); };
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", goBack);
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", goBack);
  }

  private async _submit() {
    const formEl = this.shadowRoot!.querySelector("form")!;
    const data: Record<string, any> = {};
    const formData = new FormData(formEl);
    const inputSchema = ObApi.instance!.getInputSchema(this.entity)!;
    const defaults = this.defaults;

    for (const [key, value] of formData.entries()) {
      const v = String(value);
      if (v === "") continue;
      const prop = inputSchema.properties[key];
      data[key] = formValueFor(key, prop, v);
    }
    for (const [key, value] of Object.entries(defaults)) {
      const prop = inputSchema.properties[key];
      if (!prop) continue;
      data[key] = formValueFor(key, prop, String(value));
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
      location.hash = this._successTarget(result.id || this.recordId);
    } catch (e: any) {
      this._error = e.message;
      this._render();
    }
  }

  private _backTarget(): string {
    if (this.returnTo) return this.returnTo;
    const api = ObApi.instance;
    if (this.mode === "edit" && this.recordId && api?.getAdminWorkspace(this.entity)) return `#/workspaces/${this.entity}/${this.recordId}`;
    return this.mode === "edit" && this.recordId ? `#/${this.entity}s/${this.recordId}` : `#/${this.entity}s`;
  }

  private _successTarget(id: unknown): string {
    if (this.returnTo) return this.returnTo;
    const api = ObApi.instance;
    if (id && api?.getAdminWorkspace(this.entity)) return `#/workspaces/${this.entity}/${id}`;
    return `#/${this.entity}s/${id}`;
  }
}

function inputAttrsFor(name: string, prop: any): string {
  const format = fieldFormat(prop);
  if (isMoneyField(name, prop)) return 'type="number" inputmode="decimal" step="0.01"';
  if (format === "date" || name === "date" || name.endsWith("_date")) return 'type="date"';
  if (format === "time" || name === "time" || name.endsWith("_time")) return 'type="time"';
  if (format === "date-time" || name.endsWith("_at")) return 'type="datetime-local"';
  if (prop.type === "integer") return 'type="number" inputmode="numeric" step="1"';
  if (prop.type === "number") return 'type="number" inputmode="decimal" step="any"';
  if (format === "email" || name === "email" || name.endsWith("_email")) return 'type="text" inputmode="email" autocomplete="email"';
  if (format === "phone" || name.includes("phone")) return 'type="text" inputmode="tel" autocomplete="tel"';
  if (format === "url" || name.includes("url")) return 'type="text" inputmode="url"';
  return 'type="text"';
}

function permissionNotice(message: string): string {
  return `
    <div class="empty-state permission-state" role="status">
      <strong>Not available</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function validationAttrsFor(name: string, prop: any): string {
  const attrs: string[] = [];
  if (prop.minLength !== undefined) attrs.push(`minlength="${escapeAttr(prop.minLength)}"`);
  if (prop.maxLength !== undefined) attrs.push(`maxlength="${escapeAttr(prop.maxLength)}"`);
  if (prop.minimum !== undefined) attrs.push(`min="${escapeAttr(validationNumberValue(name, prop, prop.minimum))}"`);
  if (prop.maximum !== undefined) attrs.push(`max="${escapeAttr(validationNumberValue(name, prop, prop.maximum))}"`);
  if (isFutureTemporalField(name, prop)) {
    if (isDateTimeField(name, prop)) attrs.push(`min="${escapeAttr(localDateTimeMin())}"`);
    if (isDateField(name, prop)) attrs.push(`min="${escapeAttr(localDateMin())}"`);
  }
  if (prop.pattern) attrs.push(`pattern="${escapeAttr(prop.pattern)}"`);
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function formDisplayValue(name: string, prop: any, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return "";
  if (isMoneyField(name, prop) && typeof value === "number") return moneyInputValue(value);
  if (fieldFormat(prop) === "date-time" && typeof value === "string") return dateTimeInputValue(value);
  return value;
}

function formValueFor(name: string, prop: any, value: string): string | number {
  if (isMoneyField(name, prop)) return Math.round(Number(value) * 100);
  if (prop?.type === "integer" || prop?.type === "number") return Number(value);
  if (fieldFormat(prop) === "date-time") return value.replace("T", " ");
  return value;
}

function defaultPlaceholderFor(name: string, prop: any): string {
  if (isMoneyField(name, prop)) return "0.00";
  return "";
}

function validationNumberValue(name: string, prop: any, value: unknown): unknown {
  if (isMoneyField(name, prop) && typeof value === "number") return moneyInputValue(value);
  return value;
}

function isMoneyField(name: string, prop?: any): boolean {
  return fieldFormat(prop) === "money" || name.endsWith("_pence");
}

function moneyInputValue(value: number): string {
  return (value / 100).toFixed(2);
}

function dateTimeInputValue(value: string): string {
  const normalized = value.replace(" ", "T").replace(/Z$/, "").replace(/\.\d+$/, "");
  return normalized.length >= 19 ? normalized.slice(0, 19) : normalized;
}

function isWideField(name: string, prop?: any): boolean {
  return fieldFormat(prop) === "textarea" || ["description", "notes", "body", "content"].some((part) => name.includes(part));
}

function isSystemTimestampField(name: string): boolean {
  return name === "created_at" || name === "updated_at";
}

function isFutureTemporalField(name: string, prop?: any): boolean {
  if (isSystemTimestampField(name)) return false;
  return isDateField(name, prop) || isDateTimeField(name, prop) || fieldFormat(prop) === "time" || name === "time" || name.endsWith("_time");
}

function isDateField(name: string, prop?: any): boolean {
  return fieldFormat(prop) === "date" || name === "date" || name.endsWith("_date");
}

function isDateTimeField(name: string, prop?: any): boolean {
  return fieldFormat(prop) === "date-time" || name.endsWith("_at");
}

function localDateMin(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function localDateTimeMin(): string {
  const now = new Date();
  return `${localDateMin()}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function lifecycleControlledFields(api: ObApi, entity: string): Set<string> {
  const fields = new Set<string>();
  for (const op of api.getOperations(entity)) {
    const workflow = api.getOperationWorkflow(entity, op);
    for (const transition of workflow?.transitions || []) {
      const field = transition?.field?.field;
      if (field) fields.add(field);
    }
  }
  return fields;
}

function relationshipLabelFor(row: Record<string, unknown>, relationship: any): string {
  return labelFor(row);
}

customElements.define("ob-entity-form", ObEntityForm);
