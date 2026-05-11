/**
 * <ob-commerce> - Generated catalog, cart, checkout, and payment workflow.
 */
import { ObApi } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldLabel, formatValue, labelFor } from "../format";
import { stylesheetLink } from "../style-link";

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
  private _error = "";
  private _loading = false;
  private _reviewingCart = false;
  private _availableItems: Record<string, unknown>[] = [];
  private _stateRestored = false;
  private _renderSeq = 0;
  private _onAuthChanged = () => {
    if (ObApi.instance?.authContext.userId !== null && this._error === "Sign in to continue.") {
      this._error = "";
    }
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
    return api.getEcommerceConfig() || {};
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
    if (!this._stateRestored) {
      this._restoreState(api);
      this._stateRestored = true;
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
      ${stylesheetLink()}

      <div class="page-header">
        <div>
          <div class="eyebrow">Commerce</div>
          <h1>Checkout</h1>
        </div>
        ${this._cart.length > 0 ? this._renderCartChip(config) : ""}
      </div>
      ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}

      <div class="commerce-shell" aria-live="polite">
        ${this._renderCurrentTask(api, catalogEntity, groups, selectedItems, selectedItem, config, lookups, optionDefs)}
      </div>
    `;

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedGroup = button.dataset.group || "";
        this._selectedItemId = "";
        this._reviewingCart = false;
        this._error = "";
        this._render();
      });
    });
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-item-id]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedItemId = button.dataset.itemId || "";
        this._reviewingCart = false;
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
        if (this._cart.length === 0) this._reviewingCart = false;
        this._render();
      });
    });
    this.shadowRoot!.querySelector<HTMLFormElement>('[data-form="checkout"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      this._checkout();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="back-to-groups"]')?.addEventListener("click", () => {
      this._selectedGroup = "";
      this._selectedItemId = "";
      this._reviewingCart = false;
      this._error = "";
      this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="back-to-variants"]')?.addEventListener("click", () => {
      this._selectedItemId = "";
      this._reviewingCart = false;
      this._error = "";
      this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-another"]')?.addEventListener("click", () => {
      this._selectedGroup = "";
      this._selectedItemId = "";
      this._quantity = "1";
      this._reviewingCart = false;
      this._error = "";
      this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="review-cart"]')?.addEventListener("click", () => {
      this._reviewingCart = true;
      this._error = "";
      this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="request-auth"]')?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("ob-auth-required", { detail: { returnTo: "/commerce" } }));
      this._error = "Sign in to continue.";
      this._render();
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="payment-intent"]')?.addEventListener("click", () => this._createPaymentIntent());
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="start-over"]')?.addEventListener("click", () => {
      this._selectedGroup = "";
      this._selectedItemId = "";
      this._quantity = "1";
      this._cart = [];
      this._checkoutResult = null;
      this._paymentIntent = null;
      this._reviewingCart = false;
      this._error = "";
      this._render();
    });
    this._persistState(api);
  }

  private _renderCurrentTask(
    api: ObApi,
    catalogEntity: string,
    groups: Map<string, Record<string, unknown>[]>,
    selectedItems: Record<string, unknown>[],
    selectedItem: Record<string, unknown> | null,
    config: CommerceConfig,
    lookups: LookupMap,
    optionDefs: Record<string, CommerceOption>,
  ): string {
    if (this._paymentIntent) return this._renderCompleteStep();
    if (this._checkoutResult) return this._renderPaymentStep();
    if (this._cart.length > 0 && this._reviewingCart) return this._renderReviewStep(api, config);
    if (selectedItem) return this._renderConfigureStep(optionDefs, selectedItem, config);
    if (this._selectedGroup) return this._renderVariantStep(selectedItems, selectedItem, config, lookups);
    return this._renderGroupStep(catalogEntity, groups, config);
  }

  private _renderGroupStep(catalogEntity: string, groups: Map<string, Record<string, unknown>[]>, config: CommerceConfig): string {
    return `
      <section class="panel" aria-labelledby="choose-subject-title">
        <div class="panel-header">
          <h2 id="choose-subject-title">Choose ${escapeHtml(displayName(catalogEntity))}</h2>
          <span class="step">Step 1 of 4</span>
        </div>
        ${groups.size === 0 ? `<div class="empty">No available items.</div>` : this._renderGroups(groups, config)}
      </section>
    `;
  }

  private _renderVariantStep(items: Record<string, unknown>[], selected: Record<string, unknown> | null, config: CommerceConfig, lookups: LookupMap): string {
    return `
      <section class="panel" aria-labelledby="choose-variant-title">
        <div class="panel-header">
          <div>
            <h2 id="choose-variant-title">Choose details</h2>
            <p class="notice">${escapeHtml(this._selectedGroup)}</p>
          </div>
          <span class="step">Step 2 of 4</span>
        </div>
        ${this._renderVariants(items, selected, config, lookups)}
        <div class="actions">
          <button type="button" data-action="back-to-groups">Change selection</button>
        </div>
      </section>
    `;
  }

  private _renderConfigureStep(optionDefs: Record<string, CommerceOption>, item: Record<string, unknown>, config: CommerceConfig): string {
    return `
      <section class="panel" aria-labelledby="configure-title">
        <div class="panel-header">
          <div>
            <h2 id="configure-title">Configure item</h2>
            <p class="notice">${escapeHtml(this._itemTitle(item, config))} · ${escapeHtml(this._priceLabel(item, config))}</p>
          </div>
          <span class="step">Step 3 of 4</span>
        </div>
        ${this._renderConfigureForm(optionDefs, item, config)}
      </section>
    `;
  }

  private _renderReviewStep(api: ObApi, config: CommerceConfig): string {
    const signedIn = api.authContext.userId !== null;
    return `
      <section class="panel" aria-labelledby="review-title">
        <div class="panel-header">
          <div>
            <h2 id="review-title">Review cart</h2>
            <p class="notice">${this._cart.length} line${this._cart.length === 1 ? "" : "s"} ready for checkout.</p>
          </div>
          <span class="step">Step 4 of 4</span>
        </div>
        ${this._renderCart(config)}
        ${signedIn ? `
          <form data-form="checkout">
            <div class="actions">
              <button type="submit" class="primary" ${this._loading ? "disabled" : ""}>${this._loading ? "Working" : "Checkout"}</button>
              <button type="button" data-action="add-another">Add another</button>
            </div>
          </form>
        ` : `
          <p class="notice">Sign in before checking out.</p>
          <div class="actions">
            <button type="button" class="primary" data-action="request-auth">Sign in to checkout</button>
            <button type="button" data-action="add-another">Add another</button>
          </div>
        `}
      </section>
    `;
  }

  private _renderPaymentStep(): string {
    return `
      <section class="panel" aria-labelledby="payment-title">
        <div class="panel-header">
          <h2 id="payment-title">Confirm payment</h2>
          <span class="step">Payment</span>
        </div>
        ${this._renderCheckoutSummary()}
        <div class="actions">
          <button type="button" class="primary" data-action="payment-intent">Create payment intent</button>
        </div>
      </section>
    `;
  }

  private _renderCompleteStep(): string {
    return `
      <section class="panel" aria-labelledby="complete-title">
        <div class="panel-header">
          <h2 id="complete-title">Payment ready</h2>
          <span class="step">Complete</span>
        </div>
        ${this._renderCheckoutSummary()}
        ${this._renderPaymentSummary()}
        <div class="actions">
          <button type="button" data-action="start-over">Start another order</button>
        </div>
      </section>
    `;
  }

  private _renderCartChip(config: CommerceConfig): string {
    return `
      <button type="button" class="cart-chip" data-action="review-cart">
        Cart: ${escapeHtml(this._cart.length)} · ${escapeHtml(formatValue("amount_pence", this._cartTotal(config)))}
      </button>
    `;
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
        <div class="actions split-actions">
          <button type="button" data-action="back-to-variants">Change details</button>
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
    this._reviewingCart = true;
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

  private async _checkout() {
    if (this._cart.length === 0) return;
    if (ObApi.instance!.authContext.userId === null) {
      document.dispatchEvent(new CustomEvent("ob-auth-required", { detail: { returnTo: "/commerce" } }));
      this._error = "Sign in to continue.";
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
      this._cart = [];
      this._reviewingCart = false;
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

  private _restoreState(api: ObApi) {
    try {
      const raw = sessionStorage.getItem(this._storageKey(api));
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.selectedGroup === "string") this._selectedGroup = data.selectedGroup;
      if (typeof data.selectedItemId === "string") this._selectedItemId = data.selectedItemId;
      if (typeof data.quantity === "string") this._quantity = data.quantity;
      if (data.optionState && typeof data.optionState === "object" && !Array.isArray(data.optionState)) {
        this._optionState = Object.fromEntries(
          Object.entries(data.optionState).filter(([, value]) => typeof value === "string")
        ) as Record<string, string>;
      }
      if (Array.isArray(data.cart)) {
        this._cart = data.cart.filter((line: any) => {
          return line &&
            typeof line.id === "string" &&
            Number.isFinite(Number(line.itemId)) &&
            Number.isFinite(Number(line.quantity)) &&
            line.item &&
            typeof line.item === "object";
        }).map((line: any) => ({
          id: line.id,
          itemId: Number(line.itemId),
          quantity: Number(line.quantity),
          options: line.options && typeof line.options === "object" && !Array.isArray(line.options) ? line.options : {},
          item: line.item,
        }));
      }
      this._reviewingCart = Boolean(data.reviewingCart);
    } catch {
      sessionStorage.removeItem(this._storageKey(api));
    }
  }

  private _persistState(api: ObApi) {
    try {
      const empty = !this._selectedGroup && !this._selectedItemId && this._quantity === "1" && this._cart.length === 0 && !this._reviewingCart;
      if (empty) {
        sessionStorage.removeItem(this._storageKey(api));
        return;
      }
      sessionStorage.setItem(this._storageKey(api), JSON.stringify({
        selectedGroup: this._selectedGroup,
        selectedItemId: this._selectedItemId,
        quantity: this._quantity,
        optionState: this._optionState,
        cart: this._cart,
        reviewingCart: this._reviewingCart,
      }));
    } catch {
      // Session persistence is a UX aid; checkout still works without it.
    }
  }

  private _storageKey(api: ObApi): string {
    return `openb2c:${api.spec?.info.title || "app"}:commerce-state`;
  }

  private _cartTotal(config: CommerceConfig): number {
    const priceField = config.catalog?.price?.field || "price_pence";
    return this._cart.reduce((sum, line) => sum + Number(line.item[priceField] || 0) * line.quantity, 0);
  }
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

customElements.define("ob-commerce", ObCommerce);
