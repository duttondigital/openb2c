/**
 * <ob-admin-app> - Generated admin dashboard shell.
 */
import { focusOutlet, readShellAttributes, renderApiProvider, renderSkipLink, SHELL_OBSERVED_ATTRIBUTES } from "../shell";
import "./ob-api";
import "./ob-admin-route-outlet";
import "./ob-nav";

export class ObAdminApp extends HTMLElement {
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
        <div class="app">
          <ob-nav></ob-nav>
          <ob-admin-route-outlet></ob-admin-route-outlet>
        </div>
      `)}
    `;

    this.querySelector<HTMLButtonElement>('[data-action="skip"]')?.addEventListener("click", () => {
      focusOutlet(this, "ob-admin-route-outlet");
    });
  }
}

customElements.define("ob-admin-app", ObAdminApp);
