/**
 * <ob-entity-list entity="issues"> — Data table for any entity.
 */
import { ObApi } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldLabel, formatValue, pluralDisplayName, statusClass } from "../format";
import { stylesheetLink } from "../style-link";

export class ObEntityList extends HTMLElement {
  private _sort = "";
  private _order: "asc" | "desc" = "asc";
  private _offset = 0;
  private _limit = 25;
  private _total = 0;

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

    const schema = api.getSchema(this.entity);
    if (!schema) {
      this.shadowRoot!.innerHTML = `<p>Unknown entity: ${this.entity}</p>`;
      return;
    }

    const cols = Object.keys(schema.properties);
    const fks = api.getForeignKeys(this.entity);

    // Fetch data
    const params = new URLSearchParams();
    params.set("limit", String(this._limit));
    params.set("offset", String(this._offset));
    if (this._sort) {
      params.set("sort", this._sort);
      params.set("order", this._order);
    }
    if (this.filter) {
      for (const part of this.filter.split("&")) {
        const [k, v] = part.split("=");
        if (k && v) params.set(k, v);
      }
    }

    let items: any[] = [];
    try {
      const res = await api.request(`/api/${this.entity}s?${params}`);
      const data = await res.json();
      items = data.items || [];
      this._total = data.total || 0;
    } catch {
      items = [];
    }

    const totalPages = Math.max(1, Math.ceil(this._total / this._limit));
    const currentPage = Math.floor(this._offset / this._limit) + 1;

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <div class="header">
        <div>
          <div class="eyebrow">${this._total} record${this._total !== 1 ? "s" : ""}</div>
          <h1>${escapeHtml(pluralDisplayName(this.entity))}</h1>
        </div>
        <button class="primary" type="button" data-action="create">New ${escapeHtml(displayName(this.entity))}</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${cols.map((c) => {
                const arrow = this._sort === c ? (this._order === "asc" ? "up" : "down") : "";
                const ariaSort = this._sort === c ? (this._order === "asc" ? "ascending" : "descending") : "none";
                return `
                  <th scope="col" aria-sort="${ariaSort}">
                    <button class="sort-btn" data-col="${escapeAttr(c)}">
                      ${escapeHtml(fieldLabel(c))}
                      ${arrow ? `<span class="arrow" aria-hidden="true">${arrow === "up" ? "^" : "v"}</span>` : ""}
                    </button>
                  </th>`;
              }).join("")}
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? `<tr><td colspan="${cols.length + 1}"><div class="empty-state">No records yet.</div></td></tr>` : ""}
            ${items.map((row: any) => `
              <tr data-id="${escapeAttr(row.id)}">
                ${cols.map((c) => this._renderCell(c, row[c], fks)).join("")}
                <td><a class="row-action" href="#/${this.entity}s/${escapeAttr(row.id)}">Open</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>${this._total} record${this._total !== 1 ? "s" : ""}</span>
        <div class="controls">
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

    this.shadowRoot!.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "A") return;
        location.hash = `#/${this.entity}s/${(tr as HTMLElement).dataset.id}`;
      });
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="create"]')?.addEventListener("click", () => {
      location.hash = `#/${this.entity}s/new`;
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

  private _renderCell(column: string, value: unknown, fks: Record<string, string>): string {
    if (value === null || value === undefined || value === "") {
      return `<td><span class="cell-muted">-</span></td>`;
    }

    if (fks[column]) {
      return `<td><a href="#/${fks[column]}s/${escapeAttr(value)}">#${escapeHtml(value)}</a></td>`;
    }

    const formatted = formatValue(column, value);
    const badgeClass = statusClass(column, value);
    if (column === "status" || ["active", "used", "revoked"].includes(column)) {
      return `<td><span class="badge ${badgeClass}">${escapeHtml(formatted)}</span></td>`;
    }

    return `<td>${escapeHtml(formatted)}</td>`;
  }
}

customElements.define("ob-entity-list", ObEntityList);
