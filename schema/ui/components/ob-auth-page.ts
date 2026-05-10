/**
 * <ob-auth-page> - Public account and sign-in route.
 */
import { ObApi } from "./ob-api";
import { escapeAttr, escapeHtml } from "../format";
import "./ob-auth-panel";

export class ObAuthPage extends HTMLElement {
  static get observedAttributes() {
    return ["route", "return-to"];
  }

  private _onAuthChanged = () => {
    void this._render();
  };

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    await this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) void this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const signedIn = api.authContext.userId !== null;
    const returnTo = this._returnTo();
    const title = signedIn ? "Account" : "Sign in";
    const subtitle = signedIn
      ? "Manage your current session."
      : returnTo
        ? "Sign in to continue checkout."
        : "Sign in to access your account.";

    this.innerHTML = `
      <section class="auth-page" aria-labelledby="auth-page-title">
        <div class="page-header">
          <h1 id="auth-page-title">${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <ob-auth-panel hide-header context="${returnTo ? "checkout" : "account"}" ${returnTo ? `return-to="${escapeAttr(returnTo)}"` : ""}></ob-auth-panel>
      </section>
    `;
  }

  private _returnTo(): string {
    const value = this.getAttribute("return-to") || "";
    if (!value.startsWith("/") || value.startsWith("//")) return "";
    return value.split("#")[0];
  }
}

customElements.define("ob-auth-page", ObAuthPage);
