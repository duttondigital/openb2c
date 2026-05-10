/**
 * <ob-app> - Public generated web app shell.
 */
import { ObApi } from "./ob-api";
import { apiDescription, apiTitle, focusOutlet, readShellAttributes, renderApiProvider, renderSkipLink, SHELL_OBSERVED_ATTRIBUTES } from "../shell";
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
