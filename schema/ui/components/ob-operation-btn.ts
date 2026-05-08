/**
 * <ob-operation-btn entity="issues" op="start" record-id="5">
 * Executes an operation (POST) and refreshes parent on success.
 */
import { ObApi } from "./ob-api";
import { button } from "../styles";

export class ObOperationBtn extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    const op = this.getAttribute("op") || "";
    const label = op.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    this.shadowRoot!.innerHTML = `
      <style>${button}
        .msg { font-size: 13px; margin-top: 4px; }
        .msg.error { color: var(--ob-danger, #dc2626); }
        .msg.success { color: var(--ob-success, #16a34a); }
      </style>
      <button class="primary">${label}</button>
      <div class="msg" id="msg"></div>
    `;

    this.shadowRoot!.querySelector("button")!.addEventListener("click", () => this._exec());
  }

  private async _exec() {
    const entity = this.getAttribute("entity")!;
    const op = this.getAttribute("op")!;
    const id = this.getAttribute("record-id")!;
    const btn = this.shadowRoot!.querySelector("button")!;
    const msg = this.shadowRoot!.getElementById("msg")!;

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
