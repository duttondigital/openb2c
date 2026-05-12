/**
 * <ob-account-summary> - Signed-in profile and account activity.
 */
import { ObApi } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldDisplayLabel, fieldFormat, fieldHelpText, fieldPlaceholder, formatValue, labelFor, orderedSchemaFields, pluralDisplayName, statusClass } from "../format";
import { stylesheetLink } from "../style-link";

const INTERNAL_PREFIXES = ["identity_", "api_key"];
const PROFILE_EXCLUDED_FIELDS = new Set(["id", "email", "user_id", "created_at", "updated_at"]);
const PROFILE_FIELD_ORDER = ["name", "phone", "avatar_url"];
const ACTIVITY_EXCLUDED_ENTITIES = new Set(["user"]);

type ActivityGroup = {
  entity: string;
  rows: Record<string, unknown>[];
};

export class ObAccountSummary extends HTMLElement {
  private _userId: number | null = null;
  private _profile: Record<string, unknown> | null = null;
  private _activity: ActivityGroup[] = [];
  private _error = "";
  private _message = "";
  private _saving = false;
  private _onAuthChanged = () => {
    this._profile = null;
    this._activity = [];
    void this._render();
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    await this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const userId = api.authContext.userId;
    if (userId === null) {
      this.shadowRoot!.innerHTML = "";
      return;
    }
    if (this._userId !== userId || !this._profile) {
      this._userId = userId;
      await this._load(api, userId);
    }

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <div class="account-grid">
        ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
        ${this._message ? `<div class="success-msg" role="status">${escapeHtml(this._message)}</div>` : ""}
        ${this._renderProfile(api)}
        ${this._renderActivity()}
      </div>
    `;

    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="profile"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this._saveProfile();
    });
  }

  private async _load(api: ObApi, userId: number) {
    this._error = "";
    this._message = "";
    try {
      const profileRes = await api.request(`/api/users/${userId}`);
      if (!profileRes.ok) {
        this._profile = null;
        this._error = "Could not load account details.";
      } else {
        this._profile = await profileRes.json() as Record<string, unknown>;
      }
      this._activity = await this._loadActivity(api, userId);
    } catch {
      this._profile = null;
      this._activity = [];
      this._error = "Could not load account.";
    }
  }

  private async _loadActivity(api: ObApi, userId: number): Promise<ActivityGroup[]> {
    const entities = api.getEntities().filter((entity) => {
      if (ACTIVITY_EXCLUDED_ENTITIES.has(entity)) return false;
      if (INTERNAL_PREFIXES.some((prefix) => entity.startsWith(prefix))) return false;
      const schema = api.getSchema(entity);
      return Boolean(schema?.properties?.user_id);
    });

    const groups = await Promise.all(entities.map(async (entity) => {
      try {
        const res = await api.request(`/api/${entity}s?user_id=${encodeURIComponent(String(userId))}&limit=5&sort=id&order=desc`);
        if (!res.ok) return { entity, rows: [] };
        const data = await res.json() as { items?: Record<string, unknown>[] };
        return { entity, rows: data.items || [] };
      } catch {
        return { entity, rows: [] };
      }
    }));

    return groups.filter((group) => group.rows.length > 0);
  }

  private _renderProfile(api: ObApi): string {
    const profile = this._profile || {};
    const schema = api.getInputSchema("user") || api.getSchema("user");
    const props = schema?.properties || {};
    const fields = this._editableProfileFields(api);
    return `
      <section class="account-section" aria-labelledby="profile-title">
        <div class="section-header">
          <h2 id="profile-title">Profile</h2>
          ${profile.email ? `<span>${escapeHtml(profile.email)}</span>` : ""}
        </div>
        <form data-form="profile">
          ${fields.length === 0 ? `<p class="empty">No editable profile fields are available.</p>` : fields.map((field) => {
            const prop = props[field];
            const id = `account-${field}`;
            const label = fieldDisplayLabel(field, prop);
            const help = fieldHelpText(prop);
            const placeholder = fieldPlaceholder(prop);
            const describedBy = help ? `${id}-help` : "";
            const common = `id="${escapeAttr(id)}" name="${escapeAttr(field)}" data-field="${escapeAttr(field)}"${describedBy ? ` aria-describedby="${escapeAttr(describedBy)}"` : ""}`;
            const helpMarkup = help ? `<div class="help-text" id="${escapeAttr(describedBy)}">${escapeHtml(help)}</div>` : "";
            return `
              <div class="form-group">
                <label for="${escapeAttr(id)}">${escapeHtml(label)}</label>
                ${Array.isArray(prop?.enum) && prop.enum.length > 0
                  ? `<select ${common}>
                      ${prop.enum.map((choice: unknown) => `<option value="${escapeAttr(choice)}" ${String(choice) === String(profile[field] ?? "") ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
                    </select>`
                  : `<input ${common} value="${escapeAttr(profile[field] ?? "")}" autocomplete="${escapeAttr(this._autocomplete(field, prop))}"${placeholder ? ` placeholder="${escapeAttr(placeholder)}"` : ""} />`}
                ${helpMarkup}
              </div>`;
          }).join("")}
          ${fields.length > 0 ? `
            <div class="actions">
              <button type="submit" class="primary" ${this._saving ? "disabled" : ""}>${this._saving ? "Saving" : "Save changes"}</button>
            </div>
          ` : ""}
        </form>
      </section>
    `;
  }

  private _editableProfileFields(api: ObApi): string[] {
    const schema = api.getInputSchema("user") || api.getSchema("user");
    return orderedSchemaFields(schema)
      .map(([field]) => field)
      .filter((field) => !PROFILE_EXCLUDED_FIELDS.has(field))
      .sort((a, b) => this._profileFieldRank(a) - this._profileFieldRank(b));
  }

  private _renderActivity(): string {
    return `
      <section class="account-section" aria-labelledby="activity-title">
        <div class="section-header">
          <h2 id="activity-title">Activity</h2>
        </div>
        ${this._activity.length === 0 ? `<p class="empty">No account activity yet.</p>` : this._activity.map((group) => `
          <div class="activity-group">
            <h3>${escapeHtml(pluralDisplayName(group.entity))}</h3>
            <ul>
              ${group.rows.map((row) => this._renderActivityRow(group.entity, row)).join("")}
            </ul>
          </div>
        `).join("")}
      </section>
    `;
  }

  private _renderActivityRow(entity: string, row: Record<string, unknown>): string {
    const status = row.status ?? row.active;
    const statusToken = status === undefined ? "" : String(status);
    const statusClassName = statusClass("status", status);
    const meta = this._activityMeta(row);
    return `
      <li>
        <div>
          <strong>${escapeHtml(labelFor(row))}</strong>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : `<span>${escapeHtml(displayName(entity))} #${escapeHtml(row.id)}</span>`}
        </div>
        ${statusToken ? `<span class="badge ${escapeAttr(statusClassName)}">${escapeHtml(statusToken)}</span>` : ""}
      </li>
    `;
  }

  private _activityMeta(row: Record<string, unknown>): string {
    const parts: string[] = [];
    if (typeof row.amount_pence === "number") parts.push(formatValue("amount_pence", row.amount_pence));
    if (row.price_pence !== undefined) parts.push(formatValue("price_pence", row.price_pence));
    if (row.created_at) parts.push(String(row.created_at));
    return parts.filter(Boolean).join(" · ");
  }

  private async _saveProfile() {
    const api = ObApi.instance;
    if (!api || this._userId === null) return;
    const form = this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="profile"]');
    if (!form) return;

    const body: Record<string, unknown> = {};
    const schema = api.getInputSchema("user") || api.getSchema("user");
    const required = new Set<string>(schema?.required || []);
    const props = schema?.properties || {};
    for (const field of this._editableProfileFields(api)) {
      const input = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${CSS.escape(field)}"]`);
      if (!input) continue;
      const value = input.value.trim();
      if (value === "" && !required.has(field)) continue;
      const prop = props[field];
      body[field] = prop?.type === "integer" || prop?.type === "number" ? Number(value) : value;
    }

    this._saving = true;
    this._error = "";
    this._message = "";
    await this._render();
    try {
      const res = await api.request(`/api/users/${this._userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this._error = data.error || "Could not save account details.";
      } else {
        this._profile = { ...(this._profile || {}), ...body };
        this._message = "Account details saved.";
      }
    } catch {
      this._error = "Could not save account details.";
    } finally {
      this._saving = false;
      await this._render();
    }
  }

  private _autocomplete(field: string, prop?: any): string {
    const format = fieldFormat(prop);
    if (field === "name") return "name";
    if (format === "phone" || field === "phone") return "tel";
    if (format === "url" || field === "avatar_url") return "url";
    if (format === "email" || field.endsWith("_email")) return "email";
    return "off";
  }

  private _profileFieldRank(field: string): number {
    const index = PROFILE_FIELD_ORDER.indexOf(field);
    return index === -1 ? PROFILE_FIELD_ORDER.length : index;
  }
}

customElements.define("ob-account-summary", ObAccountSummary);
