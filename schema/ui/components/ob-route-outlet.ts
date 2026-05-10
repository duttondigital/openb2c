/**
 * <ob-route-outlet> - Public web app router.
 */
import { ObApi } from "./ob-api";

export class ObRouteOutlet extends HTMLElement {
  private _routeSeq = 0;
  private _onHashChange = () => {
    void this._route();
  };

  connectedCallback() {
    this.innerHTML = `<main tabindex="-1" part="content"></main>`;
    window.addEventListener("hashchange", this._onHashChange);
    void this._route();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHashChange);
  }

  focusContent() {
    this._content()?.focus({ preventScroll: true });
  }

  private _content(): HTMLElement | null {
    return this.querySelector("main");
  }

  private async _route() {
    const routeSeq = ++this._routeSeq;
    const content = this._content();
    if (!content) return;

    const api = ObApi.instance;
    if (!api) return;
    await api.ready();
    if (routeSeq !== this._routeSeq) return;

    const hash = location.hash.slice(1) || "/";
    const routed = await this._match(hash, api);
    if (routeSeq !== this._routeSeq) return;
    if (routed.redirect) {
      location.hash = routed.redirect;
      return;
    }

    content.replaceChildren(routed.node);
    this.focusContent();
  }

  private async _match(hash: string, api: ObApi): Promise<{ node: Node; redirect?: never } | { node?: never; redirect: string }> {
    if (hash === "/commerce" && api.hasCommerceWorkflow()) {
      await import("./ob-commerce");
      return { node: document.createElement("ob-commerce") };
    }
    if (api.hasCommerceWorkflow()) return { redirect: "#/commerce" };

    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No public web app routes are available for this composition.";
    return { node: empty };
  }
}

customElements.define("ob-route-outlet", ObRouteOutlet);
