/**
 * <ob-admin-app> - Generated admin dashboard shell.
 */
import "./ob-api";
import "./ob-admin-route-outlet";
import "./ob-nav";

export class ObAdminApp extends HTMLElement {
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
        ob-admin-app {
          --ob-shell-bg: #f7f7f4;
          --ob-shell-text: #242521;
          --ob-shell-focus: 0 0 0 3px rgba(17, 17, 17, 0.16);
          --ob-nav-width: 248px;
          display: block;
          min-height: 100vh;
          font-family: system-ui, -apple-system, sans-serif;
          color: var(--ob-shell-text);
          background: var(--ob-shell-bg);
        }
        ob-admin-app *, ob-admin-app *::before, ob-admin-app *::after { box-sizing: border-box; }
        ob-admin-app .skip-link {
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
        ob-admin-app .skip-link:focus {
          transform: translateY(0);
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
      <button class="skip-link" type="button" data-action="skip">Skip to content</button>
      <ob-api src="${escapeAttr(src)}" api-base="${escapeAttr(apiBase)}">
        <div class="app">
          <ob-nav></ob-nav>
          <ob-admin-route-outlet></ob-admin-route-outlet>
        </div>
      </ob-api>
    `;

    this.querySelector<HTMLButtonElement>('[data-action="skip"]')?.addEventListener("click", () => {
      const outlet = this.querySelector("ob-admin-route-outlet") as HTMLElement & { focusContent?: () => void };
      outlet?.focusContent?.();
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

customElements.define("ob-admin-app", ObAdminApp);
