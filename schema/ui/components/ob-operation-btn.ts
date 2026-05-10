/**
 * <ob-operation-btn entity="issues" op="start" record-id="5">
 * Executes an operation (POST) and refreshes parent on success.
 */
import { ObApi } from "./ob-api";
import { stylesheetLink } from "../style-link";

export class ObOperationBtn extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["entity", "op", "record-id"];
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  private _render() {
    const op = this.getAttribute("op") || "";
    const label = op.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <button class="primary">${label}</button>
      <div class="msg" data-role="message"></div>
    `;

    this.shadowRoot!.querySelector("button")!.addEventListener("click", () => this._exec());
  }

  private async _exec() {
    const entity = this.getAttribute("entity")!;
    const op = this.getAttribute("op")!;
    const id = this.getAttribute("record-id")!;
    const btn = this.shadowRoot!.querySelector("button")!;
    const msg = this.shadowRoot!.querySelector<HTMLElement>('[data-role="message"]')!;

    btn.disabled = true;
    msg.textContent = "";
    msg.className = "msg";

    try {
      const res = await ObApi.instance!.request(`/api/${entity}s/${id}/${op}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        msg.textContent = err.error || "Failed";
        msg.className = "msg error";
      } else {
        msg.textContent = "Done";
        msg.className = "msg success";
        this.dispatchEvent(new CustomEvent("ob-operation-done", { bubbles: true }));
      }
    } catch (e: any) {
      msg.textContent = e.message;
      msg.className = "msg error";
    } finally {
      btn.disabled = false;
    }
  }
}

customElements.define("ob-operation-btn", ObOperationBtn);
