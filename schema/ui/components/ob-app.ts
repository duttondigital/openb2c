/**
 * <ob-app> - Public generated web app shell.
 */
import { ObApi } from "./ob-api";
import { apiDescription, apiTitle, focusOutlet, readShellAttributes, renderApiProvider, renderSkipLink, SHELL_OBSERVED_ATTRIBUTES, shellBaseStyles } from "../shell";
import "./ob-auth-menu";
import "./ob-route-outlet";

export class ObApp extends HTMLElement {
  static get observedAttributes() {
    return SHELL_OBSERVED_ATTRIBUTES;
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  private _render() {
    const attributes = readShellAttributes(this);

    this.innerHTML = `
      <style>
        ${shellBaseStyles("ob-app")}
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
        ob-app .top-actions {
          display: flex;
          align-items: center;
          gap: 10px;
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
          ob-app .top-actions {
            width: 100%;
          }
          ob-app .nav-button {
            flex: 1;
          }
          ob-app ob-route-outlet {
            padding: 20px;
          }
        }
      </style>
      ${renderSkipLink()}
      ${renderApiProvider(attributes, `
        <header class="topbar">
          <div class="brand">
            <div class="title" data-role="title">OpenB2C</div>
            <div class="description" data-role="description"></div>
          </div>
          <div class="top-actions">
            <button class="nav-button" type="button" data-action="checkout" hidden>Book tickets</button>
            <ob-auth-menu></ob-auth-menu>
          </div>
        </header>
        <ob-route-outlet></ob-route-outlet>
      `)}
    `;

    this.querySelector<HTMLButtonElement>('[data-action="skip"]')?.addEventListener("click", () => {
      focusOutlet(this, "ob-route-outlet");
    });
    this.querySelector<HTMLButtonElement>('[data-action="checkout"]')?.addEventListener("click", () => {
      location.hash = "#/commerce";
    });

    const api = this.querySelector("ob-api") as ObApi | null;
    if (!api) return;
    void api.ready().then(() => {
      const titleEl = this.querySelector<HTMLElement>('[data-role="title"]');
      const descriptionEl = this.querySelector<HTMLElement>('[data-role="description"]');
      const checkoutButton = this.querySelector<HTMLButtonElement>('[data-action="checkout"]');
      if (titleEl) titleEl.textContent = apiTitle(api);
      if (descriptionEl) descriptionEl.textContent = apiDescription(api);
      if (checkoutButton) checkoutButton.hidden = !api.hasCommerceWorkflow();
    });
  }
}

customElements.define("ob-app", ObApp);
