/**
 * <ob-nav> - Admin sidebar navigation derived from OpenAPI spec entities.
 */
import { ObApi } from "./ob-api";
import { escapeAttr, escapeHtml } from "../format";
import { apiDescription, apiLogo } from "../shell";
import { stylesheetLink } from "../style-link";
import "./ob-auth-menu";

export class ObNav extends HTMLElement {
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

    const items = api.getNavigationItems().filter((item) => api.canCollection(item.entity, "read"));
    const groups = api.getNavigationGroups();
    const appTitleRaw = api.spec?.info.title?.replace(/\s+API$/, "") || "App";
    const appTitle = escapeHtml(appTitleRaw);
    const appDescription = escapeHtml(apiDescription(api));
    const logo = apiLogo(api);
    const logoAlt = logo?.alt || `${appTitleRaw} logo`;

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <nav aria-label="Primary">
        <div class="brand">
          <div class="brand-lockup">
            ${logo ? `<img class="brand-logo" src="${escapeAttr(logo.src)}" alt="${escapeAttr(logoAlt)}" />` : ""}
            <div class="brand-copy">
              <div class="title">${appTitle}</div>
              ${appDescription ? `<div class="description">${appDescription}</div>` : ""}
            </div>
          </div>
        </div>
        ${groups.map((group) => {
          const groupItems = items.filter((item) => (item.group || "data") === group.id);
          if (groupItems.length === 0) return "";
          return `
            <div class="group">
              <div class="group-title">${escapeHtml(group.label)}</div>
              ${groupItems.map((item) => `<button type="button" class="nav-link" data-href="${escapeAttr(item.path)}" data-entity="${escapeAttr(item.entity)}">${escapeHtml(item.label)}</button>`).join("")}
            </div>
          `;
        }).join("")}
        <div class="account">
          <ob-auth-menu placement="sidebar"></ob-auth-menu>
        </div>
      </nav>
    `;

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-href]").forEach((button) => {
      button.addEventListener("click", () => {
        const href = button.dataset.href || "";
        if (!href.startsWith("#/")) return;
        location.hash = href;
        this._highlight();
      });
    });

    this._highlight();
  }

  private _highlight() {
    const hash = location.hash || "#/";
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-href]").forEach((button) => {
      const active = hash.startsWith(button.dataset.href || "");
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
