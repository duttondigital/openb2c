/**
 * <ob-auth-menu> - Small account entrypoint for generated identity sign-in.
 */
import { ObApi } from "./ob-api";
import { escapeHtml } from "../format";
import { stylesheetLink } from "../style-link";

export class ObAuthMenu extends HTMLElement {
  static get observedAttributes() {
    return ["placement"];
  }

  private _open = false;
  private _onAuthChanged = () => {
    void this._render();
  };
  private _onAuthRequired = (event: Event) => {
    const placement = this._placement();
    if (placement === "sidebar") {
      this._open = true;
      void this._render();
      return;
    }

    const returnTo = event instanceof CustomEvent && typeof event.detail?.returnTo === "string"
      ? event.detail.returnTo
      : currentRoutePath();
    location.hash = `#/login?return=${encodeURIComponent(returnTo)}`;
  };
  private _onClick = (event: Event) => {
    const action = this._actionFromEvent(event);
    const api = ObApi.instance;
    const signedIn = Boolean(api && api.authContext.userId !== null);

    if (this._placement() === "topbar") {
      location.hash = signedIn ? "#/account" : "#/login";
      return;
    }

    if (action === "toggle" || !action) {
      this._open = !this._open;
      void this._render();
    }
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

    const placement = this._placement();
    const signedIn = api.authContext.userId !== null;
    if (placement === "sidebar" && this._open) {
      await import("./ob-auth-panel");
    }

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}

      <button type="button" class="account-button" data-action="toggle" ${placement === "sidebar" ? `aria-expanded="${this._open ? "true" : "false"}"` : ""}>
        ${signedIn ? `User #${escapeHtml(api.authContext.userId)}` : "Sign in"}
      </button>
      ${placement === "sidebar" && this._open ? `
        <div class="menu">
          <ob-auth-panel context="admin"></ob-auth-panel>
        </div>
      ` : ""}
    `;
  }

  private _placement(): "sidebar" | "topbar" {
    return this.getAttribute("placement") === "sidebar" ? "sidebar" : "topbar";
  }

  private _actionFromEvent(event: Event): string | undefined {
    const actionTarget = event.composedPath().find((node): node is HTMLElement => {
      return node instanceof HTMLElement && Boolean(node.dataset?.action);
    });
    return actionTarget?.dataset.action;
  }
}

function currentRoutePath(): string {
  const raw = location.hash.slice(1) || "/";
  const path = raw.split("?")[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

customElements.define("ob-auth-menu", ObAuthMenu);
