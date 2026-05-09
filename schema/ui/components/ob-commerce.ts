/**
 * <ob-commerce> — Generated checkout workflow surface.
 */
import { ObApi } from "./ob-api";
import { theme, reset, form, button, card } from "../styles";

export class ObCommerce extends HTMLElement {
  private _reservation: any = null;
  private _paymentIntent: any = null;
  private _expiryResult: any = null;
  private _error = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    await this._render();
  }

  private async _options(entity: string): Promise<any[]> {
    try {
      const res = await ObApi.instance!.request(`/api/${entity}s?limit=200`);
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    if (!api.hasCommerceWorkflow()) {
      this.shadowRoot!.innerHTML = `<p>Commerce workflow is not available for this composition.</p>`;
      return;
    }

    const [users, performances] = await Promise.all([
      this._options("user"),
      this._options("performance"),
    ]);

    this.shadowRoot!.innerHTML = `
      <style>${theme} ${reset} ${form} ${button} ${card}
        .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr); gap: 16px; align-items: start; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
        pre { margin-top: 12px; padding: 12px; border-radius: var(--ob-radius); background: var(--ob-bg-alt); overflow: auto; font-size: 12px; }
        .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; font-size: 13px; }
        @media (max-width: 780px) { .grid { grid-template-columns: 1fr; } }
      </style>
      <div class="grid">
        <div class="card">
          <div class="card-header"><h2>Checkout</h2></div>
          ${this._error ? `<div class="error-msg">${this._error}</div>` : ""}
          <form id="reserve-form">
            <div class="form-group">
              <label>user_id <span class="required">*</span></label>
              <select name="user_id" required>
                <option value="">-- select --</option>
                ${users.map((user) => `<option value="${user.id}">${escapeHtml(labelFor(user))} (${user.id})</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>performance_id <span class="required">*</span></label>
              <select name="performance_id" required>
                <option value="">-- select --</option>
                ${performances.map((performance) => `<option value="${performance.id}">${escapeHtml(labelFor(performance))} (${performance.id})</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>quantity <span class="required">*</span></label>
              <input type="number" name="quantity" min="1" max="20" value="1" required />
            </div>
            <div class="form-group">
              <label>ticket_type</label>
              <input type="text" name="ticket_type" value="standard" />
            </div>
            <div class="form-group">
              <label>client</label>
              <input type="text" name="client" value="web" />
            </div>
            <div class="actions">
              <button type="submit" class="primary">Reserve</button>
              <button type="button" id="payment-btn" ${this._reservation ? "" : "disabled"}>Create Payment Intent</button>
              <button type="button" id="expire-btn">Expire Stale</button>
            </div>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><h2>Status</h2></div>
          ${this._reservation ? `<h3>Reservation</h3><pre>${escapeHtml(JSON.stringify(this._reservation, null, 2))}</pre>` : ""}
          ${this._paymentIntent ? `<h3>Payment Intent</h3><pre>${escapeHtml(JSON.stringify(this._paymentIntent, null, 2))}</pre>` : ""}
          ${this._expiryResult ? `<h3>Expiry</h3><pre>${escapeHtml(JSON.stringify(this._expiryResult, null, 2))}</pre>` : ""}
          ${this._reservation ? `
            <div class="links">
              <a href="#/bookings/${this._reservation.booking_id}">Booking #${this._reservation.booking_id}</a>
              ${(this._reservation.ticket_ids || []).map((id: number) => `<a href="#/tickets/${id}">Ticket #${id}</a>`).join("")}
              ${this._paymentIntent ? `<a href="#/transactions/${this._paymentIntent.transaction_id}">Transaction #${this._paymentIntent.transaction_id}</a>` : ""}
            </div>
          ` : `<p style="color:var(--ob-text-muted);font-size:14px">No reservation yet.</p>`}
        </div>
      </div>
    `;

    this.shadowRoot!.getElementById("reserve-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._reserve();
    });
    this.shadowRoot!.getElementById("payment-btn")?.addEventListener("click", () => this._createPaymentIntent());
    this.shadowRoot!.getElementById("expire-btn")?.addEventListener("click", () => this._expireStale());
  }

  private async _reserve() {
    const form = this.shadowRoot!.getElementById("reserve-form") as HTMLFormElement | null;
    if (!form) return;

    const formData = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const field of ["user_id", "performance_id", "quantity"]) {
      const value = formData.get(field);
      if (value !== null && String(value) !== "") body[field] = Number(value);
    }
    for (const field of ["ticket_type", "client"]) {
      const value = formData.get(field);
      if (value !== null && String(value) !== "") body[field] = String(value);
    }

    try {
      const res = await ObApi.instance!.request("/commerce/bookings/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Reservation failed";
        await this._render();
        return;
      }
      this._reservation = await res.json();
      this._paymentIntent = null;
      this._expiryResult = null;
      this._error = "";
      await this._render();
    } catch (e: any) {
      this._error = e.message || "Reservation failed";
      await this._render();
    }
  }

  private async _createPaymentIntent() {
    if (!this._reservation?.booking_id) return;
    try {
      const res = await ObApi.instance!.request(`/commerce/bookings/${this._reservation.booking_id}/payment-intent`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Payment intent failed";
        await this._render();
        return;
      }
      this._paymentIntent = await res.json();
      this._error = "";
      await this._render();
    } catch (e: any) {
      this._error = e.message || "Payment intent failed";
      await this._render();
    }
  }

  private async _expireStale() {
    try {
      const res = await ObApi.instance!.request("/commerce/bookings/expire", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        this._error = err.error || "Expiry failed";
        await this._render();
        return;
      }
      this._expiryResult = await res.json();
      this._error = "";
      await this._render();
    } catch (e: any) {
      this._error = e.message || "Expiry failed";
      await this._render();
    }
  }
}

function labelFor(row: any): string {
  return row.title || row.name || row.email || row.reference || `#${row.id}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

customElements.define("ob-commerce", ObCommerce);
