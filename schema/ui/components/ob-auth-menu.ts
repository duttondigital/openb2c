/**
 * <ob-auth-menu> - Small account entrypoint for generated identity sign-in.
 */
import { ObApi } from "./ob-api";
import { escapeHtml } from "../format";
import { safeReturnTo } from "../route";
import { stylesheetLink } from "../style-link";

export class ObAuthMenu extends HTMLElement {
  static get observedAttributes() {
    return ["placement"];
  }

  private _onAuthChanged = () => {
    void this._render();
  };
  private _onAuthRequired = (event: Event) => {
    const returnTo = event instanceof CustomEvent && typeof event.detail?.returnTo === "string"
      ? safeReturnTo(event.detail.returnTo)
      : currentRoutePath();
    location.hash = returnTo ? `#/login?return=${encodeURIComponent(returnTo)}` : "#/login";
  };
  private _onClick = (event: Event) => {
    const api = ObApi.instance;
    const signedIn = Boolean(api && api.authContext.userId !== null);

    event.preventDefault();
    location.hash = signedIn ? "#/account" : "#/login";
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    document.addEventListener("ob-auth-required", this._onAuthRequired as EventListener);
    this.addEventListener("click", this._onClick);
    await this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) void this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    document.removeEventListener("ob-auth-required", this._onAuthRequired as EventListener);
    this.removeEventListener("click", this._onClick);
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    if (!api.hasIdentityAuth()) {
      this.shadowRoot!.innerHTML = stylesheetLink();
      return;
    }

    const signedIn = api.authContext.userId !== null;

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}

      <button type="button" class="account-button" data-action="account">
        ${signedIn ? `User #${escapeHtml(api.authContext.userId)}` : "Sign in"}
      </button>
    `;
  }
}

function currentRoutePath(): string {
  const raw = location.hash.slice(1) || "/";
  const path = raw.split("?")[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

customElements.define("ob-auth-menu", ObAuthMenu);
