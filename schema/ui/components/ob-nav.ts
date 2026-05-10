/**
 * <ob-nav> - Admin sidebar navigation derived from OpenAPI spec entities.
 */
import { ObApi } from "./ob-api";
import { escapeAttr, escapeHtml, pluralDisplayName } from "../format";
import { apiDescription, apiLogo } from "../shell";
import { stylesheetLink } from "../style-link";
import "./ob-auth-menu";

const INTERNAL_PREFIXES = ["identity_", "api_key"];

export class ObNav extends HTMLElement {
  private _onHashChange = () => this._highlight();

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const entities = api.getEntities().filter(
      (e) => !INTERNAL_PREFIXES.some((p) => e.startsWith(p))
    );
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
        <div class="group">
          <div class="group-title">Data</div>
          ${entities.map((e) => `<button type="button" class="nav-link" data-href="#/${escapeAttr(e)}s" data-entity="${escapeAttr(e)}">${escapeHtml(pluralDisplayName(e))}</button>`).join("")}
        </div>
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

    window.addEventListener("hashchange", this._onHashChange);
    this._highlight();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHashChange);
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
