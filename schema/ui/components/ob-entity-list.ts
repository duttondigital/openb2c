/**
 * <ob-entity-list entity="issues"> — Data table for any entity.
 */
import { ObApi } from "./ob-api";
import { theme, reset, table, button, pagination } from "../styles";

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
      const res = await fetch(api.url(`/api/${this.entity}s?${params}`));
      const data = await res.json();
      items = data.items || [];
      this._total = data.total || 0;
    } catch {
      items = [];
    }

    const totalPages = Math.ceil(this._total / this._limit);
    const currentPage = Math.floor(this._offset / this._limit) + 1;

    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${table} ${button} ${pagination}
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .header h2 { font-size: 18px; font-weight: 600; }
        th .arrow { font-size: 10px; margin-left: 4px; }
      </style>
      <div class="header">
        <h2>${displayName(this.entity)}</h2>
        <button class="primary" id="create-btn">+ New</button>
      </div>
      <table>
        <thead>
          <tr>${cols.map((c) => {
            const arrow = this._sort === c ? (this._order === "asc" ? " ▲" : " ▼") : "";
            return `<th data-col="${c}">${c}${arrow ? `<span class="arrow">${arrow}</span>` : ""}</th>`;
          }).join("")}</tr>
        </thead>
        <tbody>
          ${items.length === 0 ? `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--ob-text-muted);padding:24px">No records</td></tr>` : ""}
          ${items.map((row: any) => `
            <tr data-id="${row.id}" style="cursor:pointer">
              ${cols.map((c) => {
                const val = row[c] ?? "";
                if (fks[c] && val) {
                  return `<td><a href="#/${fks[c]}s/${val}">${val}</a></td>`;
                }
                return `<td>${val}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="pagination">
        <span>${this._total} record${this._total !== 1 ? "s" : ""}</span>
        <div class="controls">
          <button id="prev" ${currentPage <= 1 ? "disabled" : ""}>← Prev</button>
          <span>Page ${currentPage} of ${totalPages || 1}</span>
          <button id="next" ${currentPage >= totalPages ? "disabled" : ""}>Next →</button>
        </div>
      </div>
    `;

    // Event listeners
    this.shadowRoot!.querySelectorAll("th").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col!;
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

    this.shadowRoot!.getElementById("create-btn")?.addEventListener("click", () => {
      location.hash = `#/${this.entity}s/new`;
    });

    this.shadowRoot!.getElementById("prev")?.addEventListener("click", () => {
      this._offset = Math.max(0, this._offset - this._limit);
      this._render();
    });

    this.shadowRoot!.getElementById("next")?.addEventListener("click", () => {
      if (this._offset + this._limit < this._total) {
        this._offset += this._limit;
        this._render();
      }
    });
  }
}

function displayName(entity: string): string {
  return entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + "s";
}

customElements.define("ob-entity-list", ObEntityList);
