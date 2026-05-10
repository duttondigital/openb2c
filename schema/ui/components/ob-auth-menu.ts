/**
 * <ob-auth-menu> - Public account menu for generated identity sign-in.
 */
import { ObApi } from "./ob-api";
import { button, form, reset, theme } from "../styles";
import { escapeAttr, escapeHtml } from "../format";

export class ObAuthMenu extends HTMLElement {
  private _open = false;
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
  private _onAuthRequired = () => {
    this._open = true;
    void this._render();
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    document.addEventListener("ob-auth-required", this._onAuthRequired as EventListener);
    await this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    document.removeEventListener("ob-auth-required", this._onAuthRequired as EventListener);
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const signedIn = api.authContext.userId !== null;
    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${form} ${button}
        :host {
          display: inline-block;
          position: relative;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .account-button {
          min-height: 36px;
          padding: 8px 12px;
          border: 1px solid var(--ob-border-strong);
          border-radius: var(--ob-radius);
          background: var(--ob-bg);
          color: var(--ob-text);
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }
        .account-button:hover {
          background: var(--ob-bg-alt);
        }
        .menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 20;
          width: min(340px, calc(100vw - 32px));
          padding: 16px;
          border: 1px solid var(--ob-border);
          border-radius: var(--ob-radius);
          background: var(--ob-bg);
          box-shadow: var(--ob-shadow);
        }
        .menu-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .menu-title {
          font-size: 16px;
          line-height: 1.3;
          font-weight: 800;
        }
        .menu-subtitle {
          color: var(--ob-text-muted);
          font-size: 13px;
          line-height: 1.4;
          margin-top: 2px;
        }
        .close {
          width: 32px;
          min-height: 32px;
          padding: 0;
          border: 1px solid var(--ob-border);
          background: var(--ob-bg-subtle);
          color: var(--ob-text);
          font-size: 18px;
          line-height: 1;
        }
        .session {
          display: grid;
          gap: 12px;
        }
        .session-box {
          padding: 12px;
          border: 1px solid var(--ob-border);
          border-radius: var(--ob-radius);
          background: var(--ob-bg-subtle);
        }
        .session-box strong,
        .session-box span {
          display: block;
        }
        .session-box span {
          color: var(--ob-text-muted);
          font-size: 13px;
          margin-top: 3px;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .actions button {
          flex: 1;
        }
        @media (max-width: 560px) {
          :host { position: static; }
          .menu {
            left: 16px;
            right: 16px;
            width: auto;
          }
        }
      </style>

      <button type="button" class="account-button" data-action="toggle" aria-haspopup="dialog" aria-expanded="${this._open ? "true" : "false"}">
        ${signedIn ? `User #${escapeHtml(api.authContext.userId)}` : "Sign in"}
      </button>
      ${this._open ? `
        <div class="menu" role="dialog" aria-label="Account">
          <div class="menu-header">
            <div>
              <div class="menu-title">Account</div>
              <div class="menu-subtitle">${signedIn ? "Manage your current session." : "Sign in to check out."}</div>
            </div>
            <button type="button" class="close" data-action="close" aria-label="Close account menu">x</button>
          </div>
          ${signedIn ? this._renderSignedIn(api.authContext.userId) : this._renderSignInForm()}
        </div>
      ` : ""}
    `;

    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="toggle"]')?.addEventListener("click", () => {
      this._open = !this._open;
      void this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener("click", () => {
      this._open = false;
      void this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="logout"]')?.addEventListener("click", () => {
      this._resetSignIn();
      ObApi.instance?.clearAuthContext();
      this._open = false;
      void this._render();
    });
    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="signin"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this._challengeId === null) {
        void this._startSignIn();
      } else {
        void this._verifySignIn();
      }
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="email"]')?.addEventListener("input", (event) => {
      this._email = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="code"]')?.addEventListener("input", (event) => {
      this._code = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reset-auth"]')?.addEventListener("click", () => {
      this._resetSignIn();
      void this._render();
    });
  }

  private _renderSignedIn(userId: number | null): string {
    return `
      <div class="session">
        <div class="session-box">
          <strong>Signed in</strong>
          <span>User #${escapeHtml(userId)}</span>
        </div>
        <div class="actions">
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
          <button type="submit" class="primary" ${this._loading ? "disabled" : ""}>${this._loading ? "Working" : this._challengeId === null ? "Send code" : "Sign in"}</button>
          ${this._challengeId !== null ? `<button type="button" data-action="reset-auth">Use another email</button>` : ""}
        </div>
      </form>
    `;
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
      this._open = false;
      this._loading = false;
      await this._render();
    } catch (error: any) {
      this._error = error.message || "Sign in failed";
      this._loading = false;
      await this._render();
    }
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

customElements.define("ob-auth-menu", ObAuthMenu);
