/**
 * <ob-auth-panel> - Reusable identity sign-in and session panel.
 */
import { ObApi } from "./ob-api";
import { escapeAttr, escapeHtml } from "../format";
import { stylesheetLink } from "../style-link";

export class ObAuthPanel extends HTMLElement {
  static get observedAttributes() {
    return ["context", "return-to", "hide-header"];
  }

  private _email = "";
  private _challengeId: number | null = null;
  private _code = "";
  private _devCode = "";
  private _privateKey: CryptoKey | null = null;
  private _error = "";
  private _loading = false;
  private _onAuthChanged = () => {
    void this._render();
  };
  private _onClick = (event: Event) => {
    const action = this._actionFromEvent(event);
    this._handleAction(action, event);
  };

  private _handleAction(action: string | undefined, event: Event) {
    if (action === "logout") {
      this._resetSignIn();
      ObApi.instance?.clearAuthContext();
      void this._render();
      return;
    }
    if (action === "continue") {
      const returnTo = this._returnTo();
      if (returnTo) location.hash = `#${returnTo}`;
      return;
    }
    if (action === "reset-auth") {
      event.preventDefault();
      this._resetSignIn();
      void this._render();
      return;
    }
    if (action === "submit-auth") {
      event.preventDefault();
      void this._submitSignIn();
    }
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    this.addEventListener("click", this._onClick);
    await this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) void this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    this.removeEventListener("click", this._onClick);
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const signedIn = api.authContext.userId !== null;
    const showHeader = !this.hasAttribute("hide-header");
    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}

      <section class="auth-panel" aria-label="Account">
        ${showHeader ? `<div class="panel-header">
          <div>
            <div class="panel-title">Account</div>
            <div class="panel-subtitle">${escapeHtml(this._subtitle(signedIn))}</div>
          </div>
        </div>` : ""}
        ${signedIn ? this._renderSignedIn(api.authContext.userId) : this._renderSignInForm()}
      </section>
    `;

    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="signin"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this._submitSignIn();
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="email"]')?.addEventListener("input", (event) => {
      this._email = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="code"]')?.addEventListener("input", (event) => {
      this._code = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelectorAll<HTMLElement>("[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._handleAction(button.dataset.action, event);
      });
    });
  }

  private _renderSignedIn(userId: number | null): string {
    const returnTo = this._returnTo();
    return `
      <div class="session">
        <div class="session-box">
          <strong>Signed in</strong>
          <span>User #${escapeHtml(userId)}</span>
        </div>
        <div class="actions">
          ${returnTo ? `<button type="button" class="primary" data-action="continue">Continue</button>` : ""}
          <button type="button" data-action="logout">Log out</button>
        </div>
      </div>
    `;
  }

  private _renderSignInForm(): string {
    return `
      <form data-form="signin">
        ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
        <div class="form-group">
          <label for="auth-email">Email <span class="required">*</span></label>
          <input id="auth-email" type="text" inputmode="email" name="email" data-field="email" autocomplete="email" value="${escapeAttr(this._email)}" required ${this._challengeId !== null ? "disabled" : ""} />
        </div>
        ${this._challengeId !== null ? `
          <div class="form-group">
            <label for="auth-code">Verification code <span class="required">*</span></label>
            <input id="auth-code" type="text" inputmode="numeric" pattern="[0-9]*" name="code" data-field="code" autocomplete="one-time-code" value="${escapeAttr(this._code)}" required />
            ${this._devCode ? `<div class="help-text">Development code: ${escapeHtml(this._devCode)}</div>` : ""}
          </div>
        ` : ""}
        <div class="actions">
          <button type="submit" class="primary" data-action="submit-auth" ${this._loading ? "disabled" : ""}>${this._loading ? "Working" : this._challengeId === null ? "Send code" : "Sign in"}</button>
          ${this._challengeId !== null ? `<button type="button" data-action="reset-auth">Use another email</button>` : ""}
        </div>
      </form>
    `;
  }

  private _subtitle(signedIn: boolean): string {
    if (signedIn) return "Manage your current session.";
    const context = this.getAttribute("context");
    if (context === "admin") return "Sign in to manage admin data.";
    if (context === "checkout") return "Sign in to continue checkout.";
    return "Use your email to access your account.";
  }

  private _actionFromEvent(event: Event): string | undefined {
    const actionTarget = event.composedPath().find((node): node is HTMLElement => {
      return node instanceof HTMLElement && Boolean(node.dataset?.action);
    });
    return actionTarget?.dataset.action;
  }

  private _syncFieldState() {
    const email = this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="email"]');
    const code = this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="code"]');
    if (email) this._email = email.value;
    if (code) this._code = code.value;
  }

  private async _submitSignIn() {
    this._syncFieldState();
    if (this._challengeId === null) {
      await this._startSignIn();
    } else {
      await this._verifySignIn();
    }
  }

  private async _startSignIn() {
    const email = this._email.trim();
    if (!email) {
      this._error = "Email is required";
      await this._render();
      return;
    }

    this._loading = true;
    this._error = "";
    try {
      const keypair = await ObApi.createIdentityKeypair();
      const res = await ObApi.instance!.request("/identity/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, publicKey: keypair.publicKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        this._error = data.error || "Could not send verification code";
        this._loading = false;
        await this._render();
        return;
      }
      this._privateKey = keypair.privateKey;
      this._challengeId = data.challengeId;
      this._devCode = data.code || "";
      this._code = data.code || "";
      this._loading = false;
      await this._render();
    } catch (error: any) {
      this._error = error.message || "Could not start sign in";
      this._loading = false;
      await this._render();
    }
  }

  private async _verifySignIn() {
    if (this._challengeId === null || !this._privateKey) return;
    const code = this._code.trim();
    if (!code) {
      this._error = "Verification code is required";
      await this._render();
      return;
    }

    this._loading = true;
    this._error = "";
    try {
      const signature = await ObApi.signWithIdentityKey(this._privateKey, code);
      const res = await ObApi.instance!.request("/identity/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: this._challengeId, code, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        this._error = data.error || "Sign in failed";
        this._loading = false;
        await this._render();
        return;
      }
      await ObApi.instance!.setCertificateAuth(data.certificate, this._privateKey);
      this._resetSignIn();
      this._loading = false;
      this.dispatchEvent(new CustomEvent("ob-auth-complete", { bubbles: true, composed: true, detail: { returnTo: this._returnTo() } }));
      const returnTo = this._returnTo();
      if (returnTo) {
        location.hash = `#${returnTo}`;
      } else if (currentRoutePath() === "/login") {
        location.hash = "#/account";
      } else {
        await this._render();
      }
    } catch (error: any) {
      this._error = error.message || "Sign in failed";
      this._loading = false;
      await this._render();
    }
  }

  private _returnTo(): string {
    const value = this.getAttribute("return-to") || "";
    if (!value.startsWith("/") || value.startsWith("//")) return "";
    return value.split("#")[0];
  }

  private _resetSignIn() {
    this._challengeId = null;
    this._code = "";
    this._devCode = "";
    this._privateKey = null;
    this._error = "";
    this._loading = false;
  }
}

function currentRoutePath(): string {
  const raw = location.hash.slice(1) || "/";
  const path = raw.split("?")[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

customElements.define("ob-auth-panel", ObAuthPanel);
