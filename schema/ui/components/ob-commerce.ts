/**
 * <ob-commerce> — Generated checkout workflow surface.
 */
import { ObApi } from "./ob-api";
import { theme, reset, form, button, card } from "../styles";
import { escapeAttr, escapeHtml, fieldLabel, formatValue, labelFor } from "../format";

export class ObCommerce extends HTMLElement {
  private _reservation: any = null;
  private _paymentIntent: any = null;
  private _expiryResult: any = null;
  private _error = "";
  private _formState: Record<string, string> = {
    user_id: "",
    performance_id: "",
    quantity: "1",
    ticket_type: "standard",
    client: "web",
  };

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
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 0.86fr);
          gap: 18px;
          align-items: start;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 4px;
        }
        .summary {
          display: grid;
          gap: 10px;
        }
        .summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 10px 0;
          border-bottom: 1px solid var(--ob-border);
          font-size: 14px;
        }
        .summary-row:last-child { border-bottom: 0; }
        .summary + .summary { margin-top: 14px; }
        .summary-row span:first-child {
          color: var(--ob-text-muted);
          font-weight: 700;
        }
        .summary-row span:last-child {
          text-align: right;
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        .links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
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
          font-weight: 700;
        }
        .links a:hover {
          background: var(--ob-bg-alt);
          text-decoration: none;
        }
        .empty {
          color: var(--ob-text-muted);
          font-size: 14px;
          line-height: 1.5;
          padding: 18px;
          border: 1px dashed var(--ob-border-strong);
          border-radius: var(--ob-radius);
          background: var(--ob-bg-subtle);
        }
        details {
          margin-top: 14px;
          color: var(--ob-text-muted);
          font-size: 13px;
        }
        summary {
          cursor: pointer;
          font-weight: 700;
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
        @media (max-width: 860px) {
          .grid { grid-template-columns: 1fr; }
          .page-header h1 { font-size: 24px; }
        }
        @media (max-width: 640px) {
          .actions button { width: 100%; }
        }
      </style>
      <div class="page-header">
        <div class="eyebrow">Commerce</div>
        <h1>Checkout</h1>
      </div>
      <div class="grid">
        <section class="card" aria-labelledby="reserve-title">
          <div class="card-header"><h2 id="reserve-title">Reserve tickets</h2></div>
          ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
          <form id="reserve-form">
            <div class="form-group">
              <label for="checkout-user">Customer <span class="required">*</span></label>
              <select id="checkout-user" name="user_id" required>
                <option value="">Select customer</option>
                ${users.map((user) => `<option value="${escapeAttr(user.id)}" ${String(user.id) === this._formState.user_id ? "selected" : ""}>${escapeHtml(labelFor(user))} (${escapeHtml(user.id)})</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="checkout-performance">Performance <span class="required">*</span></label>
              <select id="checkout-performance" name="performance_id" required>
                <option value="">Select performance</option>
                ${performances.map((performance) => `<option value="${escapeAttr(performance.id)}" ${String(performance.id) === this._formState.performance_id ? "selected" : ""}>${escapeHtml(labelFor(performance))} (${escapeHtml(performance.id)})</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="checkout-quantity">${fieldLabel("quantity")} <span class="required">*</span></label>
              <input id="checkout-quantity" type="text" inputmode="numeric" pattern="[0-9]*" name="quantity" value="${escapeAttr(this._formState.quantity)}" required />
            </div>
            <div class="form-group">
              <label for="checkout-ticket-type">${fieldLabel("ticket_type")}</label>
              <input id="checkout-ticket-type" type="text" name="ticket_type" value="${escapeAttr(this._formState.ticket_type)}" />
            </div>
            <div class="form-group">
              <label for="checkout-client">${fieldLabel("client")}</label>
              <input id="checkout-client" type="text" name="client" value="${escapeAttr(this._formState.client)}" />
            </div>
            <div class="actions">
              <button type="submit" class="primary">Reserve tickets</button>
              <button type="button" id="payment-btn" ${this._reservation ? "" : "disabled"}>Create payment intent</button>
              <button type="button" id="expire-btn">Expire stale bookings</button>
            </div>
          </form>
        </section>
        <section class="card" aria-labelledby="checkout-status-title" aria-live="polite">
          <div class="card-header"><h2 id="checkout-status-title">Status</h2></div>
          ${this._reservation ? this._renderReservationSummary() : `<div class="empty">No reservation yet.</div>`}
          ${this._paymentIntent ? this._renderPaymentSummary() : ""}
          ${this._expiryResult ? this._renderExpirySummary() : ""}
          ${this._reservation ? `
            <div class="links">
              <a href="#/bookings/${escapeAttr(this._reservation.booking_id)}">Booking #${escapeHtml(this._reservation.booking_id)}</a>
              ${(this._reservation.ticket_ids || []).map((id: number) => `<a href="#/tickets/${escapeAttr(id)}">Ticket #${escapeHtml(id)}</a>`).join("")}
              ${this._paymentIntent ? `<a href="#/transactions/${escapeAttr(this._paymentIntent.transaction_id)}">Transaction #${escapeHtml(this._paymentIntent.transaction_id)}</a>` : ""}
            </div>
            <details>
              <summary>Response JSON</summary>
              <pre>${escapeHtml(JSON.stringify({ reservation: this._reservation, paymentIntent: this._paymentIntent, expiry: this._expiryResult }, null, 2))}</pre>
            </details>
          ` : ""}
        </section>
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
    for (const field of ["user_id", "performance_id", "quantity", "ticket_type", "client"]) {
      this._formState[field] = String(formData.get(field) || "");
    }

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

  private _renderReservationSummary(): string {
    const ticketCount = this._reservation.ticket_ids?.length || 0;
    return `
      <div class="summary">
        <div class="summary-row"><span>Booking</span><span>#${escapeHtml(this._reservation.booking_id)}</span></div>
        <div class="summary-row"><span>Tickets</span><span>${ticketCount}</span></div>
        <div class="summary-row"><span>Amount</span><span>${escapeHtml(formatValue("amount_pence", this._reservation.amount_pence))}</span></div>
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
}

customElements.define("ob-commerce", ObCommerce);
