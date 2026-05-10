/**
 * <ob-app> - Public generated web app shell.
 */
import { ObApi } from "./ob-api";
import "./ob-route-outlet";

export class ObApp extends HTMLElement {
  static get observedAttributes() {
    return ["src", "api-base"];
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  private _render() {
    const src = this.getAttribute("src") || "openapi.json";
    const apiBase = this.getAttribute("api-base") || "";

    this.innerHTML = `
      <style>
        ob-app {
          --ob-shell-bg: #f7f7f4;
          --ob-shell-text: #242521;
          --ob-shell-focus: 0 0 0 3px rgba(17, 17, 17, 0.16);
          display: block;
          min-height: 100vh;
          font-family: system-ui, -apple-system, sans-serif;
          color: var(--ob-shell-text);
          background: var(--ob-shell-bg);
        }
        ob-app *, ob-app *::before, ob-app *::after { box-sizing: border-box; }
        ob-app .skip-link {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 10;
          transform: translateY(-140%);
          padding: 8px 12px;
          border: 0;
          border-radius: 8px;
          background: #ffffff;
          color: #111111;
          box-shadow: var(--ob-shell-focus);
          font: inherit;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }
        ob-app .skip-link:focus {
          transform: translateY(0);
        }
        ob-app .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: 72px;
          padding: 16px 32px;
          border-bottom: 1px solid #dedbd2;
          background: #ffffff;
        }
        ob-app .brand {
          display: grid;
          gap: 3px;
        }
        ob-app .title {
          font-weight: 800;
          font-size: 17px;
          line-height: 1.2;
        }
        ob-app .description {
          color: #68675f;
          font-size: 12px;
          line-height: 1.4;
        }
        ob-app .nav-button {
          min-height: 36px;
          padding: 8px 12px;
          border: 1px solid #111111;
          border-radius: 8px;
          background: #111111;
          color: white;
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        ob-app ob-route-outlet {
          display: block;
          min-width: 0;
          width: 100%;
          max-width: 1280px;
          padding: 32px;
          margin: 0 auto;
        }
        ob-app ob-route-outlet > main:focus {
          outline: none;
        }
        ob-app ob-route-outlet .empty {
          padding: 40px;
          color: #68675f;
        }
        @media (max-width: 780px) {
          ob-app .topbar {
            align-items: flex-start;
            flex-direction: column;
            padding: 16px 20px;
          }
          ob-app .nav-button {
            width: 100%;
          }
          ob-app ob-route-outlet {
            padding: 20px;
          }
        }
      </style>
      <button class="skip-link" type="button" data-action="skip">Skip to content</button>
      <ob-api src="${escapeAttr(src)}" api-base="${escapeAttr(apiBase)}">
        <header class="topbar">
          <div class="brand">
            <div class="title" data-role="title">OpenB2C</div>
            <div class="description" data-role="description"></div>
          </div>
          <button class="nav-button" type="button" data-action="checkout" hidden>Checkout</button>
        </header>
        <ob-route-outlet></ob-route-outlet>
      </ob-api>
    `;

    this.querySelector<HTMLButtonElement>('[data-action="skip"]')?.addEventListener("click", () => {
      const outlet = this.querySelector("ob-route-outlet") as HTMLElement & { focusContent?: () => void };
      outlet?.focusContent?.();
    });
    this.querySelector<HTMLButtonElement>('[data-action="checkout"]')?.addEventListener("click", () => {
      location.hash = "#/commerce";
    });

    const api = this.querySelector("ob-api") as ObApi | null;
    if (!api) return;
    void api.ready().then(() => {
      const title = api.spec?.info?.title?.replace(/\s+API$/, "") || "App";
      const description = api.spec?.info?.description || "";
      const titleEl = this.querySelector<HTMLElement>('[data-role="title"]');
      const descriptionEl = this.querySelector<HTMLElement>('[data-role="description"]');
      const checkoutButton = this.querySelector<HTMLButtonElement>('[data-action="checkout"]');
      if (titleEl) titleEl.textContent = title;
      if (descriptionEl) descriptionEl.textContent = description;
      if (checkoutButton) checkoutButton.hidden = !api.hasCommerceWorkflow();
    });
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

customElements.define("ob-app", ObApp);
