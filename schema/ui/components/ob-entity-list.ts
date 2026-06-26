/**
 * <ob-entity-list entity="issues"> — Data table for any entity.
 */
import { ObApi } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldDisplayLabel, filterableSchemaFields, formatValue, labelFor, labelWithTemporal, listFieldDisplayLabel, listSchemaFields, pluralDisplayName, statusClass } from "../format";
import { stylesheetLink } from "../style-link";

export class ObEntityList extends HTMLElement {
  private _sort = "";
  private _order: "asc" | "desc" = "asc";
  private _offset = 0;
  private _limit = 25;
  private _total = 0;
  private _filters: Record<string, string> = {};
  private _filterAttr = "";
  private _error = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["entity", "filter"];
  }

  async connectedCallback() {
    await this._render();
  }

  attributeChangedCallback() {
    this._offset = 0;
    this._render();
  }

  private get entity(): string {
    return this.getAttribute("entity") || "";
  }

  private get filter(): string {
    return this.getAttribute("filter") || "";
  }

  async _render() {
    const api = ObApi.instance;
    if (!api || !this.entity) return;
    await api.ready();
    this._syncFiltersFromAttribute();

    const schema = api.getSchema(this.entity);
    if (!schema) {
      this.shadowRoot!.innerHTML = `<p>Unknown entity: ${this.entity}</p>`;
      return;
    }
    if (!api.canCollection(this.entity, "read")) {
      this.shadowRoot!.innerHTML = `
        ${stylesheetLink()}
        ${permissionNotice(api.permissionReason(this.entity, "read") || `You do not have access to ${pluralDisplayName(this.entity).toLowerCase()}.`)}
      `;
      return;
    }

    const inputSchema = api.getInputSchema(this.entity);
    const cols = listSchemaFields(schema);
    const fks = api.getForeignKeys(this.entity);
    const relationships = api.getForeignKeyRelationships(this.entity);
    const filterFields = filterableSchemaFields(inputSchema || schema, fks);
    const sortableFields = new Set(["id", ...Object.keys(inputSchema?.properties || {})]);
    if (this._sort && !sortableFields.has(this._sort)) this._sort = "";
    const filterOptions = await this._loadFilterOptions(filterFields, fks, api);

    const params = new URLSearchParams();
    params.set("limit", String(this._limit));
    params.set("offset", String(this._offset));
    if (this._sort) {
      params.set("sort", this._sort);
      params.set("order", this._order);
    }
    for (const [field, value] of Object.entries(this._filters)) {
      if (value !== "") params.set(field, value);
    }

    let items: any[] = [];
    this._error = "";
    try {
      const res = await api.request(`/api/${this.entity}s?${params}`);
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const data = await res.json();
      items = data.items || [];
      this._total = data.total || 0;
    } catch (error: any) {
      items = [];
      this._total = 0;
      this._error = error?.message || "Could not load records.";
    }

    const totalPages = Math.max(1, Math.ceil(this._total / this._limit));
    const currentPage = Math.floor(this._offset / this._limit) + 1;
    const activeFilterCount = Object.keys(this._filters).filter((field) => this._filters[field] !== "").length;
    const canCreate = api.canCollection(this.entity, "create");
    const emptyState = activeFilterCount > 0
      ? {
          title: "No matching records.",
          body: "Adjust or clear the current filters.",
          action: `<button type="button" data-action="clear-filters">Clear filters</button>`,
        }
      : {
          title: `No ${pluralDisplayName(this.entity).toLowerCase()} yet.`,
          body: canCreate ? `Create the first ${displayName(this.entity).toLowerCase()} record.` : "No records are visible to your current session.",
          action: canCreate ? `<button type="button" class="primary" data-action="create-empty">New ${escapeHtml(displayName(this.entity))}</button>` : "",
        };
    const rowHref = (row: any) => recordHref(api, this.entity, row.id);
    const primaryColumn = primaryRecordColumn(cols);
    const tableMinWidth = Math.max(760, (cols.length + 1) * 128);

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <div class="header">
          <div>
            <div class="eyebrow">${this._total} record${this._total !== 1 ? "s" : ""}</div>
            <h1>${escapeHtml(pluralDisplayName(this.entity))}</h1>
          </div>
        ${canCreate ? `<button class="primary" type="button" data-action="create">New ${escapeHtml(displayName(this.entity))}</button>` : ""}
      </div>
      ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
      ${filterFields.length > 0 ? `
        <form class="filter-bar" aria-label="${escapeAttr(pluralDisplayName(this.entity))} filters">
          ${filterFields.map(([field, prop]) => this._renderFilterControl(field, prop, fks, relationships, filterOptions)).join("")}
          <div class="filter-actions">
            <button type="button" data-action="clear-filters" ${activeFilterCount === 0 ? "disabled" : ""}>Clear</button>
          </div>
        </form>
      ` : ""}
      <div class="table-wrap">
        <table class="entity-table" style="min-width: ${tableMinWidth}px">
          <thead>
            <tr>
              ${cols.map(([c, prop]) => {
                const arrow = this._sort === c ? (this._order === "asc" ? "up" : "down") : "";
                const ariaSort = this._sort === c ? (this._order === "asc" ? "ascending" : "descending") : "none";
                const sortable = sortableFields.has(c);
                return `
                  <th scope="col" aria-sort="${ariaSort}">
                    ${sortable ? `<button class="sort-btn" data-col="${escapeAttr(c)}">` : `<span class="column-label">`}
                      ${escapeHtml(listFieldDisplayLabel(c, prop, c === primaryColumn))}
                      ${arrow ? `<span class="arrow" aria-hidden="true">${arrow === "up" ? "^" : "v"}</span>` : ""}
                    ${sortable ? "</button>" : "</span>"}
                  </th>`;
              }).join("")}
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? `<tr><td colspan="${cols.length + 1}"><div class="empty-state"><strong>${escapeHtml(emptyState.title)}</strong><span>${escapeHtml(emptyState.body)}</span>${emptyState.action}</div></td></tr>` : ""}
            ${items.map((row: any) => `
              <tr data-id="${escapeAttr(row.id)}">
                ${cols.map(([c, prop]) => this._renderCell(c, row[c], fks, prop, api, relationships[c], filterOptions[c] || [], c === primaryColumn ? rowHref(row) : "")).join("")}
                <td><a class="row-action" href="${escapeAttr(rowHref(row))}">Open</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>${this._total} record${this._total !== 1 ? "s" : ""}</span>
        <div class="controls">
          <label class="page-size">
            <span>Rows</span>
            <select data-action="page-size" aria-label="Rows per page">
              ${[10, 25, 50, 100].map((size) => `<option value="${size}" ${this._limit === size ? "selected" : ""}>${size}</option>`).join("")}
            </select>
          </label>
          <button data-action="previous-page" ${currentPage <= 1 ? "disabled" : ""} aria-label="Previous page">Previous</button>
          <span>Page ${currentPage} of ${totalPages}</span>
          <button data-action="next-page" ${currentPage >= totalPages ? "disabled" : ""} aria-label="Next page">Next</button>
        </div>
      </div>
    `;

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const col = btn.dataset.col!;
        if (this._sort === col) {
          this._order = this._order === "asc" ? "desc" : "asc";
        } else {
          this._sort = col;
          this._order = "asc";
        }
        this._offset = 0;
        this._render();
      });
    });

    this.shadowRoot!.querySelectorAll<HTMLSelectElement>("[data-filter-field]").forEach((control) => {
      control.addEventListener("change", () => {
        const field = control.dataset.filterField || "";
        if (!field) return;
        if (control.value === "") {
          delete this._filters[field];
        } else {
          this._filters[field] = control.value;
        }
        this._offset = 0;
        this._render();
      });
    });

    this.shadowRoot!.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "A") return;
        location.hash = recordHref(ObApi.instance!, this.entity, (tr as HTMLElement).dataset.id || "");
      });
    });

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-action="create"], [data-action="create-empty"]').forEach((button) => button.addEventListener("click", () => {
      location.hash = `#/${this.entity}s/new`;
    }));

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-action="clear-filters"]').forEach((button) => button.addEventListener("click", () => {
      this._filters = {};
      this._filterAttr = "";
      this._offset = 0;
      if (this.hasAttribute("filter")) {
        this.removeAttribute("filter");
      } else {
        this._render();
      }
    }));

    this.shadowRoot!.querySelector<HTMLSelectElement>('[data-action="page-size"]')?.addEventListener("change", (event) => {
      const value = Number((event.target as HTMLSelectElement).value);
      if (Number.isFinite(value) && value > 0) {
        this._limit = value;
        this._offset = 0;
        this._render();
      }
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="previous-page"]')?.addEventListener("click", () => {
      this._offset = Math.max(0, this._offset - this._limit);
      this._render();
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-page"]')?.addEventListener("click", () => {
      if (this._offset + this._limit < this._total) {
        this._offset += this._limit;
        this._render();
      }
    });
  }

  private _syncFiltersFromAttribute() {
    const raw = this.filter;
    if (raw === this._filterAttr) return;
    this._filterAttr = raw;
    this._filters = parseFilter(raw);
  }

  private async _loadFilterOptions(fields: [string, any][], fks: Record<string, string>, api: ObApi): Promise<Record<string, any[]>> {
    const options: Record<string, any[]> = {};
    await Promise.all(fields.map(async ([field]) => {
      const entity = fks[field];
      if (!entity) return;
      try {
        const res = await api.request(`/api/${entity}s?limit=200`);
        const data = await res.json();
        options[field] = data.items || [];
      } catch {
        options[field] = [];
      }
    }));
    return options;
  }

  private _renderFilterControl(
    field: string,
    prop: any,
    fks: Record<string, string>,
    relationships: Record<string, any>,
    filterOptions: Record<string, any[]>,
  ): string {
    const id = `filter-${field}`;
    const label = fieldDisplayLabel(field, prop);
    const current = this._filters[field] || "";

    if (fks[field]) {
      const options = filterOptions[field] || [];
      const relationship = relationships[field];
      return `
        <div class="filter-control">
          <label for="${escapeAttr(id)}">${escapeHtml(label)}</label>
          <select id="${escapeAttr(id)}" data-filter-field="${escapeAttr(field)}">
            <option value="">All ${escapeHtml(label.toLowerCase())}</option>
            ${options.map((row: any) => {
              const optionLabel = relationshipLabelFor(row, relationship);
              return `<option value="${escapeAttr(row.id)}" ${String(row.id) === String(current) ? "selected" : ""}>${escapeHtml(optionLabel)} (${escapeHtml(row.id)})</option>`;
            }).join("")}
          </select>
        </div>`;
    }

    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      return `
        <div class="filter-control">
          <label for="${escapeAttr(id)}">${escapeHtml(label)}</label>
          <select id="${escapeAttr(id)}" data-filter-field="${escapeAttr(field)}">
            <option value="">All ${escapeHtml(label.toLowerCase())}</option>
            ${prop.enum.map((choice: unknown) => `<option value="${escapeAttr(choice)}" ${String(choice) === String(current) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
          </select>
        </div>`;
    }

    return "";
  }

  private _renderCell(column: string, value: unknown, fks: Record<string, string>, prop: any, api: ObApi, relationship: any, lookupRows: any[], href = ""): string {
    if (value === null || value === undefined || value === "") {
      return `<td><span class="cell-muted">-</span></td>`;
    }

    const formatted = formatValue(column, value, prop);
    if (href) {
      return `<td><a class="record-link" title="${escapeAttr(formatted)}" href="${escapeAttr(href)}">${escapeHtml(formatted)}</a></td>`;
    }

    if (fks[column]) {
      const targetHref = recordHref(api, fks[column], value);
      const targetLabel = lookupLabelFor(value, lookupRows, relationship);
      const title = targetLabel === `#${value}` ? targetLabel : `${targetLabel} (#${value})`;
      return `<td><a class="cell-link" title="${escapeAttr(title)}" href="${escapeAttr(targetHref)}">${escapeHtml(targetLabel)}</a></td>`;
    }

    const badgeClass = statusClass(column, value);
    if (column === "status" || ["active", "used", "revoked"].includes(column)) {
      return `<td><span class="badge ${badgeClass}" title="${escapeAttr(formatted)}">${escapeHtml(formatted)}</span></td>`;
    }

    return `<td><span class="cell-value" title="${escapeAttr(formatted)}">${escapeHtml(formatted)}</span></td>`;
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

function parseFilter(raw: string): Record<string, string> {
  const filters: Record<string, string> = {};
  if (!raw) return filters;
  const params = new URLSearchParams(raw);
  for (const [field, value] of params) {
    if (field && value !== "") filters[field] = value;
  }
  return filters;
}

function relationshipLabelFor(row: Record<string, unknown>, relationship: any): string {
  const targetField = relationship?.targetLabel?.field;
  if (targetField && row[targetField] !== undefined && row[targetField] !== null && row[targetField] !== "") {
    return labelWithTemporal(String(row[targetField]), row);
  }
  return labelFor(row);
}

function lookupLabelFor(value: unknown, rows: any[], relationship: any): string {
  const row = rows.find((candidate) => String(candidate.id) === String(value));
  if (!row) return `#${value}`;
  return relationshipLabelFor(row, relationship);
}

customElements.define("ob-entity-list", ObEntityList);

function recordHref(api: ObApi, entity: string, id: unknown): string {
  if (api.getAdminWorkspace(entity)) return `#/workspaces/${entity}/${id}`;
  return `#/${entity}s/${id}`;
}

function primaryRecordColumn(cols: [string, any][]): string {
  return cols.find(([field]) => field === "name")?.[0]
    || cols.find(([field]) => field === "title")?.[0]
    || cols.find(([field]) => field === "email")?.[0]
    || cols.find(([field]) => field === "reference")?.[0]
    || cols.find(([field]) => field !== "id")?.[0]
    || cols[0]?.[0]
    || "";
}
