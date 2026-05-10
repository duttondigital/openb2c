/**
 * <ob-admin-app> - Generated admin dashboard shell.
 */
import { focusOutlet, readShellAttributes, renderApiProvider, renderSkipLink, SHELL_OBSERVED_ATTRIBUTES, shellBaseStyles } from "../shell";
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
      <style>
        ${shellBaseStyles("ob-admin-app")}
        ob-admin-app {
          --ob-nav-width: 248px;
        }
        ob-admin-app .app {
          display: flex;
          min-height: 100vh;
        }
        ob-admin-app ob-nav {
          flex: 0 0 var(--ob-nav-width);
        }
        ob-admin-app ob-admin-route-outlet {
          flex: 1;
          min-width: 0;
          width: 100%;
          max-width: 1280px;
          padding: 32px;
          margin: 0 auto;
        }
        ob-admin-app ob-admin-route-outlet > main:focus {
          outline: none;
        }
        ob-admin-app ob-admin-route-outlet .empty {
          padding: 40px;
          color: #68675f;
        }
        @media (max-width: 780px) {
          ob-admin-app .app {
            flex-direction: column;
          }
          ob-admin-app ob-nav {
            flex-basis: auto;
          }
          ob-admin-app ob-admin-route-outlet {
            padding: 20px;
          }
        }
      </style>
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
