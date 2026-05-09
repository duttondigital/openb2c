/**
 * <ob-nav> — Sidebar navigation derived from OpenAPI spec entities.
 */
import { ObApi } from "./ob-api";
import { theme, reset } from "../styles";

const INTERNAL_PREFIXES = ["identity_", "api_key"];

export class ObNav extends HTMLElement {
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

    this.shadowRoot!.innerHTML = `
      <style>
        ${theme} ${reset}
        nav {
          width: var(--ob-nav-width);
          min-height: 100vh;
          background: var(--ob-bg-alt);
          border-right: 1px solid var(--ob-border);
          padding: 20px 0;
        }
        .title {
          padding: 0 16px 16px;
          font-weight: 700;
          font-size: 16px;
          border-bottom: 1px solid var(--ob-border);
          margin-bottom: 8px;
        }
        a {
          display: block;
          padding: 8px 16px;
          color: var(--ob-text);
          font-size: 14px;
          text-decoration: none;
          border-radius: 4px;
          margin: 2px 8px;
        }
        a:hover, a.active {
          background: var(--ob-primary);
          color: white;
        }
      </style>
      <nav>
        <div class="title">${api.spec?.info.title || "App"}</div>
        ${api.hasCommerceWorkflow() ? `<a href="#/commerce" data-entity="commerce">Checkout</a>` : ""}
        ${entities.map((e) => `<a href="#/${e}s" data-entity="${e}">${displayName(e)}</a>`).join("")}
      </nav>
    `;

    window.addEventListener("hashchange", () => this._highlight());
    this._highlight();
  }

  private _highlight() {
    const hash = location.hash || "#/";
    this.shadowRoot!.querySelectorAll("a").forEach((a) => {
      a.classList.toggle("active", hash.startsWith(a.getAttribute("href")!));
    });
  }
}

function displayName(entity: string): string {
  return entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + "s";
}

customElements.define("ob-nav", ObNav);
