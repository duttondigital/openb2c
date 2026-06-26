/**
 * <ob-nav> - Admin sidebar navigation derived from OpenAPI spec entities.
 */
import { ObApi } from "./ob-api";
import { escapeAttr, escapeHtml } from "../format";
import { apiLogo } from "../shell";
import { stylesheetLink } from "../style-link";
import "./ob-auth-menu";

export class ObNav extends HTMLElement {
  private _expanded = false;
  private _collapsed = readCollapsedState();
  private _onHashChange = () => this._highlight();
  private _onAuthChanged = () => {
    void this._render();
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    window.addEventListener("hashchange", this._onHashChange);
    await this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    window.removeEventListener("hashchange", this._onHashChange);
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const items = api.getAdminWorkspaces().filter((item) => api.canCollection(item.entity, "read"));
    const groups = api.getAdminWorkspaceGroups();
    const temporalEntities = api.getAdminTemporalEntities().filter((item) => api.canCollection(item.entity, "read"));
    const appTitleRaw = api.spec?.info.title?.replace(/\s+API$/, "") || "App";
    const appTitle = escapeHtml(appTitleRaw);
    const logo = apiLogo(api);
    const logoAlt = logo?.alt || `${appTitleRaw} logo`;
    this.toggleAttribute("collapsed", this._collapsed);
    const collapseLabel = this._collapsed ? "Expand sidebar" : "Collapse sidebar";
    const collapseIcon = sidebarCollapseIcon(this._collapsed);

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <nav aria-label="Primary" class="${this._expanded ? "expanded" : ""}">
        <div class="brand">
          <div class="brand-lockup">
            ${logo ? `<img class="brand-logo" src="${escapeAttr(logo.src)}" alt="${escapeAttr(logoAlt)}" />` : ""}
            <div class="brand-copy">
              <div class="title">${appTitle}</div>
            </div>
          </div>
          <div class="brand-actions">
            <button class="collapse-toggle" type="button" aria-label="${escapeAttr(collapseLabel)}" title="${escapeAttr(collapseLabel)}" aria-pressed="${this._collapsed ? "true" : "false"}">
              ${collapseIcon}
            </button>
            <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="${this._expanded ? "true" : "false"}">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
        <div class="nav-groups">
          ${temporalEntities.length > 0 ? `
            <div class="group">
              <div class="group-title">Views</div>
              <button type="button" class="nav-link" data-href="#/calendar">Calendar</button>
            </div>
          ` : ""}
          ${groups.map((group) => {
          const groupItems = items.filter((item) => (item.group || "data") === group.id);
          const entries = [
            ...groupItems.map((item) => ({ path: item.path, label: item.label, entity: item.entity, priority: item.displayPriority ?? 1000 })),
          ].sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
          if (entries.length === 0) return "";
          return `
            <div class="group">
              <div class="group-title">${escapeHtml(group.label)}</div>
              ${entries.map((item) => `<button type="button" class="nav-link" data-href="${escapeAttr(item.path)}" data-entity="${escapeAttr(item.entity)}">${escapeHtml(item.label)}</button>`).join("")}
            </div>
          `;
          }).join("")}
        </div>
        <div class="account">
          <ob-auth-menu placement="sidebar"></ob-auth-menu>
        </div>
      </nav>
    `;
    this._syncCollapsedState();

    this.shadowRoot!.querySelector<HTMLButtonElement>(".collapse-toggle")?.addEventListener("click", () => {
      this._collapsed = !this._collapsed;
      writeCollapsedState(this._collapsed);
      this._syncCollapsedState();
    });

    this.shadowRoot!.querySelector<HTMLButtonElement>(".menu-toggle")?.addEventListener("click", async () => {
      this._expanded = !this._expanded;
      await this._render();
    });

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-href]").forEach((button) => {
      button.addEventListener("click", () => {
        const href = button.dataset.href || "";
        if (!href.startsWith("#/")) return;
        location.hash = href;
        this._expanded = false;
        this._highlight();
        void this._render();
      });
    });

    this._highlight();
  }

  private _syncCollapsedState() {
    this.toggleAttribute("collapsed", this._collapsed);
    const collapseLabel = this._collapsed ? "Expand sidebar" : "Collapse sidebar";
    const button = this.shadowRoot!.querySelector<HTMLButtonElement>(".collapse-toggle");
    if (!button) return;
    button.setAttribute("aria-label", collapseLabel);
    button.setAttribute("title", collapseLabel);
    button.setAttribute("aria-pressed", this._collapsed ? "true" : "false");
    button.innerHTML = sidebarCollapseIcon(this._collapsed);
  }

  private _highlight() {
    const hash = location.hash || "#/";
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-href]").forEach((button) => {
      const entity = button.dataset.entity || "";
      const active = hash.startsWith(button.dataset.href || "") || (entity ? hash.startsWith(`#/${entity}s`) : false);
      button.classList.toggle("active", active);
      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }
}

customElements.define("ob-nav", ObNav);

function sidebarCollapseIcon(collapsed: boolean): string {
  const arrow = collapsed
    ? `<path d="M14 8l4 4-4 4" />`
    : `<path d="M18 8l-4 4 4 4" />`;
  return `
    <svg class="collapse-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      ${arrow}
    </svg>
  `;
}

const NAV_COLLAPSED_KEY = "openb2c.admin.navCollapsed";

function readCollapsedState(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsedState(value: boolean): void {
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, value ? "true" : "false");
  } catch {
    // Ignore unavailable storage; the toggle still works for the current render.
  }
}
