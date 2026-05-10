/**
 * <ob-nav> — Sidebar navigation derived from OpenAPI spec entities.
 */
import { ObApi } from "./ob-api";
import { theme, reset } from "../styles";
import { escapeAttr, escapeHtml, pluralDisplayName } from "../format";

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
    const appTitle = escapeHtml(api.spec?.info.title?.replace(/\s+API$/, "") || "App");
    const appDescription = escapeHtml(api.spec?.info.description || "");

    this.shadowRoot!.innerHTML = `
      <style>
        ${theme} ${reset}
        :host {
          position: sticky;
          top: 0;
          height: 100vh;
          z-index: 2;
        }
        nav {
          width: var(--ob-nav-width);
          min-height: 100vh;
          background: var(--ob-bg);
          border-right: 1px solid var(--ob-border);
          padding: 18px 12px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .brand {
          padding: 0 8px 14px;
          border-bottom: 1px solid var(--ob-border);
        }
        .title {
          font-weight: 800;
          font-size: 17px;
          line-height: 1.2;
        }
        .description {
          color: var(--ob-text-muted);
          font-size: 12px;
          line-height: 1.4;
          margin-top: 5px;
        }
        .group { display: grid; gap: 4px; }
        .group-title {
          padding: 0 8px 4px;
          color: var(--ob-text-muted);
          font-size: 12px;
          font-weight: 800;
        }
        .nav-link {
          display: flex;
          align-items: center;
          width: 100%;
          min-height: 38px;
          padding: 8px 10px;
          background: transparent;
          color: var(--ob-text);
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          text-decoration: none;
          border-radius: var(--ob-radius);
          border: 1px solid transparent;
          text-align: left;
          cursor: pointer;
        }
        .nav-link:hover {
          background: var(--ob-bg-alt);
          border-color: var(--ob-border);
          text-decoration: none;
        }
        .nav-link.active {
          background: var(--ob-primary);
          color: white;
          border-color: var(--ob-primary);
          box-shadow: var(--ob-shadow-sm);
        }
        @media (max-width: 780px) {
          :host {
            position: static;
            height: auto;
          }
          nav {
            width: 100%;
            min-height: auto;
            border-right: 0;
            border-bottom: 1px solid var(--ob-border);
          }
        }
      </style>
      <nav aria-label="Primary">
        <div class="brand">
          <div class="title">${appTitle}</div>
          ${appDescription ? `<div class="description">${appDescription}</div>` : ""}
        </div>
        ${api.hasCommerceWorkflow() ? `
          <div class="group">
            <div class="group-title">Commerce</div>
            <button type="button" class="nav-link" data-href="#/commerce" data-entity="commerce">Checkout</button>
          </div>
        ` : ""}
        <div class="group">
          <div class="group-title">Data</div>
          ${entities.map((e) => `<button type="button" class="nav-link" data-href="#/${escapeAttr(e)}s" data-entity="${escapeAttr(e)}">${escapeHtml(pluralDisplayName(e))}</button>`).join("")}
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
