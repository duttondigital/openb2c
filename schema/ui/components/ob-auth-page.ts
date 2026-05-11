/**
 * <ob-auth-page> - Shared public/admin account and sign-in route.
 */
import { ObApi } from "./ob-api";
import { escapeAttr, escapeHtml } from "../format";
import "./ob-account-summary";
import "./ob-auth-panel";

export class ObAuthPage extends HTMLElement {
  static get observedAttributes() {
    return ["context", "route", "return-to"];
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
    this.toggleAttribute("signed-in", signedIn);
    const returnTo = this._returnTo();
    const context = this._context(returnTo);
    const title = signedIn ? "Account" : "Sign in";
    const subtitle = signedIn
      ? "Manage your profile, activity, and session."
      : context === "admin"
        ? "Sign in to manage admin data."
        : returnTo
        ? "Sign in to continue checkout."
        : "Sign in to access your account.";

    this.innerHTML = `
      <section class="auth-page" aria-labelledby="auth-page-title">
        <div class="page-header">
          <h1 id="auth-page-title">${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        ${signedIn ? "<ob-account-summary></ob-account-summary>" : ""}
        <ob-auth-panel hide-header context="${escapeAttr(context)}" ${returnTo ? `return-to="${escapeAttr(returnTo)}"` : ""}></ob-auth-panel>
      </section>
    `;
  }

  private _context(returnTo: string): string {
    const context = this.getAttribute("context");
    if (context === "admin") return "admin";
    if (returnTo) return "checkout";
    return "account";
  }

  private _returnTo(): string {
    const value = this.getAttribute("return-to") || "";
    if (!value.startsWith("/") || value.startsWith("//")) return "";
    return value.split("#")[0];
  }
}

customElements.define("ob-auth-page", ObAuthPage);
