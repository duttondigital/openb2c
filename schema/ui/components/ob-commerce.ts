/**
 * <ob-commerce> - Generated catalog, cart, checkout, and payment workflow.
 */
import { ObApi } from "./ob-api";
import { theme, reset, form, button } from "../styles";
import { displayName, escapeAttr, escapeHtml, fieldLabel, formatValue, labelFor } from "../format";

type FieldRef = { field: string; references?: string | null };

type CommerceOption = {
  field?: FieldRef | null;
  type?: string;
  label?: string | null;
  default?: string | null;
  choices?: string[];
  required?: boolean;
  min?: number | null;
  max?: number | null;
};

type CommerceConfig = {
  enabled?: boolean;
  catalog?: {
    entity?: string;
    title?: FieldRef | null;
    description?: FieldRef | null;
    price?: FieldRef | null;
    groupBy?: FieldRef[];
    variantFields?: FieldRef[];
    availability?: { field?: FieldRef | null; available?: string };
  };
  order?: { entity?: string; user?: FieldRef | null };
  lineItem?: { entity?: string; options?: Record<string, CommerceOption> };
  transaction?: { entity?: string };
  checkout?: { currency?: string; expiryMinutes?: number; maxQuantity?: number; maxLines?: number };
};

type CartLine = {
  id: string;
  itemId: number;
  quantity: number;
  options: Record<string, string | number | null>;
  item: Record<string, unknown>;
};

type LookupMap = Record<string, Map<string, string>>;

export class ObCommerce extends HTMLElement {
  private _selectedGroup = "";
  private _selectedItemId = "";
  private _quantity = "1";
  private _client = "web";
  private _optionState: Record<string, string> = {};
  private _cart: CartLine[] = [];
  private _checkoutResult: any = null;
  private _paymentIntent: any = null;
  private _expiryResult: any = null;
  private _error = "";
  private _loading = false;
  private _availableItems: Record<string, unknown>[] = [];
  private _authEmail = "";
  private _authChallengeId: number | null = null;
  private _authCode = "";
  private _authDevCode = "";
  private _authPrivateKey: CryptoKey | null = null;
  private _authError = "";
  private _authLoading = false;
  private _renderSeq = 0;
  private _onAuthChanged = () => {
    void this._render();
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    document.addEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
    await this._render();
  }

  disconnectedCallback() {
    document.removeEventListener("ob-auth-changed", this._onAuthChanged as EventListener);
  }

  private _config(api: ObApi): CommerceConfig {
    return api.getEcommerceConfig() || legacyCommerceConfig();
  }

  private async _rows(entity: string): Promise<Record<string, unknown>[]> {
    if (!entity) return [];
    try {
      const res = await fetch(ObApi.instance!.url(`/api/${entity}s?limit=200`));
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }

  private async _variantLookups(api: ObApi, config: CommerceConfig): Promise<LookupMap> {
    const catalogEntity = config.catalog?.entity || "";
    const fks = catalogEntity ? api.getForeignKeys(catalogEntity) : {};
    const fields = config.catalog?.variantFields || [];
    const lookups: LookupMap = {};
    await Promise.all(fields.map(async (ref) => {
      const entity = fks[ref.field];
      if (!entity) return;
      const rows = await this._rows(entity);
      lookups[ref.field] = new Map(rows.map((row) => [String(row.id), labelFor(row)]));
    }));
    return lookups;
  }

  private _availableCatalog(items: Record<string, unknown>[], config: CommerceConfig): Record<string, unknown>[] {
    const availability = config.catalog?.availability;
    if (!availability?.field) return items;
    return items.filter((item) => String(item[availability.field!.field]) === String(availability.available));
  }

  private _groups(items: Record<string, unknown>[], config: CommerceConfig): Map<string, Record<string, unknown>[]> {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const item of items) {
      const key = this._groupKey(item, config);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return groups;
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    const renderSeq = ++this._renderSeq;
    await api.ready();
    if (renderSeq !== this._renderSeq) return;

    if (!api.hasCommerceWorkflow()) {
      this.shadowRoot!.innerHTML = `<p>Commerce workflow is not available for this composition.</p>`;
      return;
    }

    const config = this._config(api);
    const catalogEntity = config.catalog?.entity || "item";
    const optionDefs = config.lineItem?.options || {};
    for (const [name, option] of Object.entries(optionDefs)) {
      if (this._optionState[name] === undefined && option.default !== null && option.default !== undefined) {
        this._optionState[name] = String(option.default);
      }
    }

    const [catalogRows, lookups] = await Promise.all([
      this._rows(catalogEntity),
      this._variantLookups(api, config),
    ]);
    if (renderSeq !== this._renderSeq) return;
    const catalog = this._availableCatalog(catalogRows, config);
    this._availableItems = catalog;
    const groups = this._groups(catalog, config);
    if (this._selectedGroup && !groups.has(this._selectedGroup)) {
      this._selectedGroup = "";
      this._selectedItemId = "";
    }
    const selectedItems = this._selectedGroup ? (groups.get(this._selectedGroup) || []) : [];
    if (this._selectedItemId && !selectedItems.some((item) => String(item.id) === this._selectedItemId)) {
      this._selectedItemId = "";
    }
    const selectedItem = selectedItems.find((item) => String(item.id) === this._selectedItemId) || null;

    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${form} ${button}
        :host { display: block; }
        .page-header {
          margin-bottom: 18px;
        }
        .eyebrow {
          color: var(--ob-text-muted);
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .page-header h1 {
          font-size: 28px;
          line-height: 1.15;
          font-weight: 800;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 0.44fr);
          gap: 18px;
          align-items: start;
        }
        .flow {
          display: grid;
          gap: 14px;
        }
        .panel {
          background: var(--ob-bg);
          border: 1px solid var(--ob-border);
          border-radius: var(--ob-radius);
          padding: 18px;
          box-shadow: var(--ob-shadow-sm);
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 14px;
        }
        .panel-header h2 {
          font-size: 18px;
          line-height: 1.25;
          font-weight: 800;
        }
        .step {
          color: var(--ob-text-muted);
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .selector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 10px;
        }
        .selector-card {
          align-items: stretch;
          justify-content: space-between;
          min-height: 112px;
          padding: 14px;
          text-align: left;
          background: var(--ob-bg);
          border: 1px solid var(--ob-border);
          color: var(--ob-text);
          flex-direction: column;
        }
        .selector-card:hover {
          background: var(--ob-bg-subtle);
          border-color: var(--ob-border-strong);
        }
        .selector-card.selected {
          border-color: var(--ob-primary);
          box-shadow: inset 0 0 0 1px var(--ob-primary);
        }
        .selector-title {
          font-size: 15px;
          line-height: 1.3;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .selector-meta {
          display: grid;
          gap: 4px;
          color: var(--ob-text-muted);
          font-size: 13px;
          line-height: 1.35;
        }
        .variant-card {
          min-height: 86px;
        }
        .configure-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .configure-grid .full { grid-column: 1 / -1; }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 4px;
        }
        .cart {
          position: sticky;
          top: 18px;
          display: grid;
          gap: 14px;
        }
        .cart-list {
          display: grid;
          gap: 10px;
        }
        .cart-line {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          padding: 12px;
          border: 1px solid var(--ob-border);
          border-radius: var(--ob-radius);
          background: var(--ob-bg-subtle);
        }
        .cart-line h3 {
          font-size: 14px;
          line-height: 1.3;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .cart-line p {
          color: var(--ob-text-muted);
          font-size: 13px;
          line-height: 1.4;
        }
        .icon-btn {
          width: 34px;
          min-height: 34px;
          padding: 0;
          font-size: 18px;
          line-height: 1;
        }
        .summary {
          display: grid;
          gap: 8px;
          font-size: 14px;
        }
        .summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 8px 0;
          border-bottom: 1px solid var(--ob-border);
        }
        .summary-row:last-child { border-bottom: 0; }
        .summary-row span:first-child {
          color: var(--ob-text-muted);
          font-weight: 700;
        }
        .summary-row span:last-child {
          text-align: right;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .session-box {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          padding: 12px;
          border: 1px solid var(--ob-border);
          border-radius: var(--ob-radius);
          background: var(--ob-bg-subtle);
        }
        .session-box strong,
        .session-box span {
          display: block;
        }
        .session-box strong {
          font-size: 14px;
          line-height: 1.3;
        }
        .session-box span {
          color: var(--ob-text-muted);
          font-size: 13px;
          line-height: 1.35;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--ob-success);
        }
        .total-row {
          font-size: 16px;
        }
        .empty {
          color: var(--ob-text-muted);
          font-size: 14px;
          line-height: 1.45;
          padding: 18px;
          border: 1px dashed var(--ob-border-strong);
          border-radius: var(--ob-radius);
          background: var(--ob-bg-subtle);
        }
        .links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
          font-size: 13px;
        }
        .links a {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 6px 10px;
          border: 1px solid var(--ob-border);
          border-radius: var(--ob-radius);
          background: var(--ob-bg);
          font-weight: 800;
        }
        .links a:hover {
          background: var(--ob-bg-alt);
          text-decoration: none;
        }
        details {
          color: var(--ob-text-muted);
          font-size: 13px;
        }
        summary {
          cursor: pointer;
          font-weight: 800;
        }
        pre {
          margin-top: 10px;
          padding: 12px;
          border-radius: var(--ob-radius);
          background: #242521;
          color: #fbfbf9;
          overflow: auto;
          font-size: 12px;
          line-height: 1.5;
        }
        @media (max-width: 980px) {
          .layout { grid-template-columns: 1fr; }
          .cart { position: static; }
        }
        @media (max-width: 680px) {
          .page-header h1 { font-size: 24px; }
          .panel-header { flex-direction: column; }
          .configure-grid { grid-template-columns: 1fr; }
          .actions button { width: 100%; }
        }
      </style>

      <div class="page-header">
        <div class="eyebrow">Commerce</div>
        <h1>Checkout</h1>
      </div>
      ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}

      <div class="layout">
        <div class="flow">
          <section class="panel" aria-labelledby="choose-subject-title">
            <div class="panel-header">
              <h2 id="choose-subject-title">Choose ${escapeHtml(displayName(catalogEntity))}</h2>
              <span class="step">Step 1</span>
            </div>
            ${groups.size === 0 ? `<div class="empty">No available items.</div>` : this._renderGroups(groups, config)}
          </section>

          <section class="panel" aria-labelledby="choose-variant-title">
            <div class="panel-header">
              <h2 id="choose-variant-title">Choose details</h2>
              <span class="step">Step 2</span>
            </div>
            ${this._selectedGroup ? this._renderVariants(selectedItems, selectedItem, config, lookups) : `<div class="empty">Choose ${escapeHtml(displayName(catalogEntity))} first.</div>`}
          </section>

          <section class="panel" aria-labelledby="configure-title">
            <div class="panel-header">
              <h2 id="configure-title">Configure item</h2>
              <span class="step">Step 3</span>
            </div>
            ${selectedItem ? this._renderConfigureForm(optionDefs, selectedItem, config) : `<div class="empty">Choose details before configuring.</div>`}
          </section>
        </div>

        <aside class="cart" aria-live="polite">
          <section class="panel" aria-labelledby="cart-title">
            <div class="panel-header">
              <h2 id="cart-title">Cart</h2>
              <span class="step">${this._cart.length} line${this._cart.length === 1 ? "" : "s"}</span>
            </div>
            ${this._renderCart(config)}
          </section>

          <section class="panel" aria-labelledby="checkout-title">
            <div class="panel-header">
              <h2 id="checkout-title">Checkout</h2>
            </div>
            ${this._renderCheckoutForm(api)}
          </section>

          <section class="panel" aria-labelledby="status-title">
            <div class="panel-header">
              <h2 id="status-title">Status</h2>
            </div>
            ${this._renderStatus()}
          </section>
        </aside>
      </div>
    `;

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedGroup = button.dataset.group || "";
        this._selectedItemId = "";
        this._error = "";
        this._render();
      });
    });
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-item-id]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedItemId = button.dataset.itemId || "";
        this._error = "";
        this._render();
      });
    });
    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="configure"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      this._addSelectedToCart();
    });
    this.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-option]").forEach((input) => {
      input.addEventListener("input", () => {
        this._optionState[input.dataset.option || ""] = input.value;
      });
      input.addEventListener("change", () => {
        this._optionState[input.dataset.option || ""] = input.value;
      });
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="quantity"]')?.addEventListener("input", (event) => {
      this._quantity = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-remove-line]").forEach((button) => {
      button.addEventListener("click", () => {
        this._cart = this._cart.filter((line) => line.id !== button.dataset.removeLine);
        this._checkoutResult = null;
        this._paymentIntent = null;
        this._render();
      });
    });
    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="checkout"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      this._checkout();
    });
    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="signin"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this._authChallengeId === null) {
        this._startSignIn();
      } else {
        this._verifySignIn();
      }
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="auth-email"]')?.addEventListener("input", (event) => {
      this._authEmail = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelector<HTMLInputElement>('[data-field="auth-code"]')?.addEventListener("input", (event) => {
      this._authCode = (event.target as HTMLInputElement).value;
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reset-auth"]')?.addEventListener("click", () => {
      this._authChallengeId = null;
      this._authCode = "";
      this._authDevCode = "";
      this._authPrivateKey = null;
      this._authError = "";
      this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="payment-intent"]')?.addEventListener("click", () => this._createPaymentIntent());
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="expire-orders"]')?.addEventListener("click", () => this._expireStale());
  }

  private _renderGroups(groups: Map<string, Record<string, unknown>[]>, config: CommerceConfig): string {
    return `
      <div class="selector-grid">
        ${[...groups.entries()].map(([key, items]) => {
          const first = items[0];
          const description = this._fieldValue(first, config.catalog?.description);
          const price = this._priceLabel(first, config);
          return `
            <button type="button" class="selector-card ${key === this._selectedGroup ? "selected" : ""}" data-group="${escapeAttr(key)}" aria-pressed="${key === this._selectedGroup}">
              <span class="selector-title">${escapeHtml(key)}</span>
              <span class="selector-meta">
                ${description ? `<span>${escapeHtml(description)}</span>` : ""}
                <span>${escapeHtml(items.length)} option${items.length === 1 ? "" : "s"}${price ? ` from ${escapeHtml(price)}` : ""}</span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  private _renderVariants(items: Record<string, unknown>[], selected: Record<string, unknown> | null, config: CommerceConfig, lookups: LookupMap): string {
    if (items.length === 0) return `<div class="empty">No available details.</div>`;
    return `
      <div class="selector-grid">
        ${items.map((item) => {
          const id = String(item.id);
          return `
            <button type="button" class="selector-card variant-card ${selected && String(selected.id) === id ? "selected" : ""}" data-item-id="${escapeAttr(id)}" aria-pressed="${selected && String(selected.id) === id ? "true" : "false"}">
              <span class="selector-title">${escapeHtml(this._variantLabel(item, config, lookups))}</span>
              <span class="selector-meta"><span>${escapeHtml(this._priceLabel(item, config))}</span></span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  private _renderConfigureForm(optionDefs: Record<string, CommerceOption>, item: Record<string, unknown>, config: CommerceConfig): string {
    const maxQuantity = config.checkout?.maxQuantity || 20;
    return `
      <form data-form="configure">
        <div class="configure-grid">
          <div class="form-group">
            <label for="line-quantity">${escapeHtml(fieldLabel("quantity"))} <span class="required">*</span></label>
            <input id="line-quantity" type="text" inputmode="numeric" pattern="[0-9]*" name="quantity" data-field="quantity" value="${escapeAttr(this._quantity)}" required aria-describedby="line-quantity-help" />
            <div class="help-text" id="line-quantity-help">Max ${escapeHtml(maxQuantity)}</div>
          </div>
          <div class="form-group">
            <label>${escapeHtml(fieldLabel(config.catalog?.price?.field || "price_pence"))}</label>
            <input type="text" value="${escapeAttr(this._priceLabel(item, config))}" disabled />
          </div>
          ${Object.entries(optionDefs).map(([name, option]) => this._renderOptionInput(name, option)).join("")}
        </div>
        <div class="actions">
          <button type="submit" class="primary">Add to cart</button>
        </div>
      </form>
    `;
  }

  private _renderOptionInput(name: string, option: CommerceOption): string {
    const label = option.label || fieldLabel(option.field?.field || name);
    const value = this._optionState[name] ?? option.default ?? "";
    const required = option.required ? "required" : "";
    const describedBy = `${name}-help`;
    const help = option.choices?.length
      ? `${option.choices.length} choices`
      : option.min !== null && option.min !== undefined || option.max !== null && option.max !== undefined
        ? [option.min !== null && option.min !== undefined ? `Min ${option.min}` : "", option.max !== null && option.max !== undefined ? `Max ${option.max}` : ""].filter(Boolean).join(", ")
        : "";

    if (option.choices && option.choices.length > 0) {
      return `
        <div class="form-group">
          <label for="option-${escapeAttr(name)}">${escapeHtml(label)}${option.required ? ' <span class="required">*</span>' : ""}</label>
          <select id="option-${escapeAttr(name)}" name="${escapeAttr(name)}" data-option="${escapeAttr(name)}" ${required} aria-describedby="${escapeAttr(describedBy)}">
            ${option.required ? "" : `<option value="">None</option>`}
            ${option.choices.map((choice) => `<option value="${escapeAttr(choice)}" ${String(choice) === String(value) ? "selected" : ""}>${escapeHtml(fieldLabel(choice))}</option>`).join("")}
          </select>
          ${help ? `<div class="help-text" id="${escapeAttr(describedBy)}">${escapeHtml(help)}</div>` : ""}
        </div>
      `;
    }

    const inputAttrs = option.type === "integer"
      ? `type="text" inputmode="numeric" pattern="[0-9]*"`
      : `type="text"`;
    return `
      <div class="form-group">
        <label for="option-${escapeAttr(name)}">${escapeHtml(label)}${option.required ? ' <span class="required">*</span>' : ""}</label>
        <input id="option-${escapeAttr(name)}" ${inputAttrs} name="${escapeAttr(name)}" data-option="${escapeAttr(name)}" value="${escapeAttr(value)}" ${required} aria-describedby="${escapeAttr(describedBy)}" />
        ${help ? `<div class="help-text" id="${escapeAttr(describedBy)}">${escapeHtml(help)}</div>` : ""}
      </div>
    `;
  }

  private _renderCart(config: CommerceConfig): string {
    if (this._cart.length === 0) return `<div class="empty">Cart is empty.</div>`;
    const total = this._cartTotal(config);
    return `
      <div class="cart-list">
        ${this._cart.map((line) => `
          <div class="cart-line">
            <div>
              <h3>${escapeHtml(this._itemTitle(line.item, config))}</h3>
              <p>${escapeHtml(this._lineDescription(line, config))}</p>
            </div>
            <button type="button" class="icon-btn danger" data-remove-line="${escapeAttr(line.id)}" aria-label="Remove ${escapeAttr(this._itemTitle(line.item, config))}">x</button>
          </div>
        `).join("")}
      </div>
      <div class="summary">
        <div class="summary-row total-row"><span>Total</span><span>${escapeHtml(formatValue("amount_pence", total))}</span></div>
      </div>
    `;
  }

  private _renderCheckoutForm(api: ObApi): string {
    if (api.authContext.userId === null) {
      return this._renderSignInForm();
    }

    const canCheckout = this._cart.length > 0;
    const canExpire = api.authContext.scopes.includes("*") || api.authContext.scopes.includes("commerce.expire");
    return `
      <form data-form="checkout">
        <div class="session-box" aria-label="Signed in session">
          <span class="status-dot" aria-hidden="true"></span>
          <div>
            <strong>Signed in</strong>
            <span>User #${escapeHtml(api.authContext.userId)}</span>
          </div>
        </div>
        <div class="actions">
          <button type="submit" class="primary" ${canCheckout && !this._loading ? "" : "disabled"}>${this._loading ? "Working" : "Checkout"}</button>
          <button type="button" data-action="payment-intent" ${this._checkoutResult ? "" : "disabled"}>Create payment intent</button>
          ${canExpire ? `<button type="button" data-action="expire-orders">Expire stale orders</button>` : ""}
        </div>
      </form>
    `;
  }

  private _renderSignInForm(): string {
    return `
      <form data-form="signin">
        <div class="empty">Sign in to check out.</div>
        ${this._authError ? `<div class="error-msg" role="alert">${escapeHtml(this._authError)}</div>` : ""}
        <div class="form-group">
          <label for="auth-email">Email <span class="required">*</span></label>
          <input id="auth-email" type="text" inputmode="email" name="email" data-field="auth-email" autocomplete="email" value="${escapeAttr(this._authEmail)}" required ${this._authChallengeId !== null ? "disabled" : ""} />
        </div>
        ${this._authChallengeId !== null ? `
          <div class="form-group">
            <label for="auth-code">Verification code <span class="required">*</span></label>
            <input id="auth-code" type="text" inputmode="numeric" pattern="[0-9]*" name="code" data-field="auth-code" autocomplete="one-time-code" value="${escapeAttr(this._authCode)}" required />
            ${this._authDevCode ? `<div class="help-text">Development code: ${escapeHtml(this._authDevCode)}</div>` : ""}
          </div>
        ` : ""}
        <div class="actions">
          <button type="submit" class="primary" ${this._authLoading ? "disabled" : ""}>${this._authLoading ? "Working" : this._authChallengeId === null ? "Send code" : "Sign in"}</button>
          ${this._authChallengeId !== null ? `<button type="button" data-action="reset-auth">Use another email</button>` : ""}
        </div>
      </form>
    `;
  }

  private _renderStatus(): string {
    if (!this._checkoutResult && !this._paymentIntent && !this._expiryResult) {
      return `<div class="empty">No checkout activity yet.</div>`;
    }
    return `
      ${this._checkoutResult ? this._renderCheckoutSummary() : ""}
      ${this._paymentIntent ? this._renderPaymentSummary() : ""}
      ${this._expiryResult ? this._renderExpirySummary() : ""}
    `;
  }

  private _renderCheckoutSummary(): string {
    return `
      <div class="summary">
        <div class="summary-row"><span>Order</span><span>#${escapeHtml(this._checkoutResult.order_id)}</span></div>
        <div class="summary-row"><span>Items</span><span>${escapeHtml(this._checkoutResult.line_item_ids?.length || 0)}</span></div>
        <div class="summary-row"><span>Amount</span><span>${escapeHtml(formatValue("amount_pence", this._checkoutResult.amount_pence))}</span></div>
        <div class="summary-row"><span>Status</span><span>${escapeHtml(this._checkoutResult.status)}</span></div>
      </div>
    `;
  }

  private _renderPaymentSummary(): string {
    return `
      <div class="summary">
        <div class="summary-row"><span>Transaction</span><span>#${escapeHtml(this._paymentIntent.transaction_id)}</span></div>
        <div class="summary-row"><span>Reference</span><span>${escapeHtml(this._paymentIntent.reference || "-")}</span></div>
      </div>
    `;
  }

  private _renderExpirySummary(): string {
    return `
      <div class="summary">
        <div class="summary-row"><span>Expired</span><span>${escapeHtml(this._expiryResult.expired ?? 0)}</span></div>
      </div>
    `;
  }

  private _addSelectedToCart() {
    const config = this._config(ObApi.instance!);
    const catalogEntity = config.catalog?.entity || "";
    const quantity = Number.parseInt(this._quantity, 10);
    const maxQuantity = config.checkout?.maxQuantity || 20;
    const maxLines = config.checkout?.maxLines || 50;
    if (!this._selectedItemId) {
      this._error = "Choose details before adding to cart";
      this._render();
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      this._error = `Quantity must be between 1 and ${maxQuantity}`;
      this._render();
      return;
    }
    if (this._cart.length >= maxLines) {
      this._error = `Cart can contain at most ${maxLines} lines`;
      this._render();
      return;
    }

    const options = this._collectOptions();
    if (!options.ok) {
      this._error = options.error;
      this._render();
      return;
    }

    const selected = this._availableItems.find((item) => String(item.id) === this._selectedItemId) || null;
    if (!selected) {
      this._error = `Selected ${catalogEntity || "item"} is unavailable`;
      this._render();
      return;
    }

    this._cart = [
      ...this._cart,
      {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        itemId: Number(this._selectedItemId),
        quantity,
        options: options.data,
        item: selected,
      },
    ];
    this._checkoutResult = null;
    this._paymentIntent = null;
    this._expiryResult = null;
    this._error = "";
    this._render();
  }

  private _collectOptions(): { ok: true; data: Record<string, string | number | null> } | { ok: false; error: string } {
    const config = this._config(ObApi.instance!);
    const defs = config.lineItem?.options || {};
    const data: Record<string, string | number | null> = {};
    for (const [name, option] of Object.entries(defs)) {
      const input = this.shadowRoot!.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-option="${cssEscape(name)}"]`);
      const raw = input?.value ?? "";
      if (!raw && option.required) return { ok: false, error: `${option.label || fieldLabel(name)} is required` };
      if (!raw) {
        data[name] = null;
        continue;
      }
      if (option.choices && option.choices.length > 0 && !option.choices.includes(raw)) {
        return { ok: false, error: `${option.label || fieldLabel(name)} is not available` };
      }
      if (option.type === "integer") {
        const value = Number(raw);
        if (!Number.isInteger(value)) return { ok: false, error: `${option.label || fieldLabel(name)} must be a whole number` };
        if (option.min !== null && option.min !== undefined && value < option.min) return { ok: false, error: `${option.label || fieldLabel(name)} is below minimum` };
        if (option.max !== null && option.max !== undefined && value > option.max) return { ok: false, error: `${option.label || fieldLabel(name)} is above maximum` };
        data[name] = value;
      } else {
        data[name] = raw;
      }
    }
    return { ok: true, data };
  }

  private async _startSignIn() {
    const email = this._authEmail.trim();
    if (!email) {
      this._authError = "Email is required";
      await this._render();
      return;
    }

    this._authLoading = true;
    this._authError = "";
    try {
      const keypair = await ObApi.createIdentityKeypair();
      const res = await ObApi.instance!.request("/identity/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, publicKey: keypair.publicKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        this._authError = data.error || "Could not send verification code";
        this._authLoading = false;
        await this._render();
        return;
      }
      this._authPrivateKey = keypair.privateKey;
      this._authChallengeId = data.challengeId;
      this._authDevCode = data.code || "";
      this._authCode = data.code || "";
      this._authLoading = false;
      await this._render();
    } catch (error: any) {
      this._authError = error.message || "Could not start sign in";
      this._authLoading = false;
      await this._render();
    }
  }

  private async _verifySignIn() {
    if (this._authChallengeId === null || !this._authPrivateKey) return;
    const code = this._authCode.trim();
    if (!code) {
      this._authError = "Verification code is required";
      await this._render();
      return;
    }

    this._authLoading = true;
    this._authError = "";
    try {
      const signature = await ObApi.signWithIdentityKey(this._authPrivateKey, code);
      const res = await ObApi.instance!.request("/identity/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: this._authChallengeId, code, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        this._authError = data.error || "Sign in failed";
        this._authLoading = false;
        await this._render();
        return;
      }
      await ObApi.instance!.setCertificateAuth(data.certificate, this._authPrivateKey);
      this._authChallengeId = null;
      this._authCode = "";
      this._authDevCode = "";
      this._authPrivateKey = null;
      this._authError = "";
      this._authLoading = false;
      await this._render();
    } catch (error: any) {
      this._authError = error.message || "Sign in failed";
      this._authLoading = false;
      await this._render();
    }
  }

  private async _checkout() {
    if (this._cart.length === 0) return;
    if (ObApi.instance!.authContext.userId === null) {
      this._error = "Sign in before checkout";
      await this._render();
      return;
    }

    this._loading = true;
    this._error = "";
    const body: Record<string, unknown> = {
      client: this._client,
      items: this._cart.map((line) => ({
        item_id: line.itemId,
        quantity: line.quantity,
        options: line.options,
      })),
    };

    try {
      const res = await ObApi.instance!.request("/commerce/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Checkout failed";
        this._loading = false;
        await this._render();
        return;
      }
      this._checkoutResult = await res.json();
      this._paymentIntent = null;
      this._expiryResult = null;
      this._cart = [];
      this._loading = false;
      await this._render();
    } catch (error: any) {
      this._error = error.message || "Checkout failed";
      this._loading = false;
      await this._render();
    }
  }

  private async _createPaymentIntent() {
    if (!this._checkoutResult?.order_id) return;
    try {
      const res = await ObApi.instance!.request(`/commerce/orders/${this._checkoutResult.order_id}/payment-intent`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Payment intent failed";
        await this._render();
        return;
      }
      this._paymentIntent = await res.json();
      this._error = "";
      await this._render();
    } catch (error: any) {
      this._error = error.message || "Payment intent failed";
      await this._render();
    }
  }

  private async _expireStale() {
    try {
      const res = await ObApi.instance!.request("/commerce/orders/expire", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Expiry failed";
        await this._render();
        return;
      }
      this._expiryResult = await res.json();
      this._error = "";
      await this._render();
    } catch (error: any) {
      this._error = error.message || "Expiry failed";
      await this._render();
    }
  }

  private _groupKey(item: Record<string, unknown>, config: CommerceConfig): string {
    const fields = config.catalog?.groupBy || [];
    if (fields.length === 0) return this._itemTitle(item, config);
    return fields.map((field) => this._fieldValue(item, field)).filter(Boolean).join(" - ") || this._itemTitle(item, config);
  }

  private _itemTitle(item: Record<string, unknown>, config: CommerceConfig): string {
    return this._fieldValue(item, config.catalog?.title) || labelFor(item);
  }

  private _variantLabel(item: Record<string, unknown>, config: CommerceConfig, lookups: LookupMap): string {
    const fields = config.catalog?.variantFields || [];
    if (fields.length === 0) return this._itemTitle(item, config);
    return fields.map((field) => this._formatFieldValue(field, item[field.field], lookups)).filter(Boolean).join(" - ");
  }

  private _fieldValue(item: Record<string, unknown>, field?: FieldRef | null): string {
    if (!field) return "";
    const value = item[field.field];
    if (value === null || value === undefined || value === "") return "";
    return formatValue(field.field, value);
  }

  private _formatFieldValue(field: FieldRef, value: unknown, lookups: LookupMap): string {
    if (value === null || value === undefined || value === "") return "";
    const lookup = lookups[field.field]?.get(String(value));
    if (lookup) return lookup;
    return formatValue(field.field, value);
  }

  private _priceLabel(item: Record<string, unknown>, config: CommerceConfig): string {
    const priceField = config.catalog?.price?.field || "price_pence";
    const value = Number(item[priceField] || 0);
    return value > 0 ? formatValue(priceField, value) : "";
  }

  private _lineDescription(line: CartLine, config: CommerceConfig): string {
    const parts = [
      `${line.quantity} x ${this._priceLabel(line.item, config)}`,
      ...Object.entries(line.options)
        .filter(([, value]) => value !== null && value !== "")
        .map(([name, value]) => `${fieldLabel(name)}: ${value}`),
    ];
    return parts.join(" - ");
  }

  private _cartTotal(config: CommerceConfig): number {
    const priceField = config.catalog?.price?.field || "price_pence";
    return this._cart.reduce((sum, line) => sum + Number(line.item[priceField] || 0) * line.quantity, 0);
  }
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function legacyCommerceConfig(): CommerceConfig {
  return {
    enabled: true,
    catalog: {
      entity: "performance",
      title: { field: "title" },
      description: { field: "description" },
      price: { field: "price_pence" },
      groupBy: [{ field: "title" }],
      variantFields: [{ field: "date" }, { field: "time" }, { field: "venue_id" }],
      availability: { field: { field: "status" }, available: "scheduled" },
    },
    order: { entity: "booking", user: { field: "user_id", references: "user(id)" } },
    lineItem: {
      entity: "ticket",
      options: {
        ticket_type: { field: { field: "ticket_type" }, label: "Ticket type", default: "standard", choices: ["standard", "concession", "patron"] },
        seat: { field: { field: "seat" }, label: "Seat" },
      },
    },
    transaction: { entity: "transaction" },
    checkout: { currency: "GBP", expiryMinutes: 15, maxQuantity: 20, maxLines: 50 },
  };
}

customElements.define("ob-commerce", ObCommerce);
