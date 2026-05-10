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

    const route = parseHash(location.hash);
    const routed = await this._match(route.path, route.params, api);
    if (routeSeq !== this._routeSeq) return;
    if (routed.redirect) {
      location.hash = routed.redirect;
      return;
    }

    content.replaceChildren(routed.node);
    this.focusContent();
  }

  private async _match(hash: string, params: URLSearchParams, api: ObApi): Promise<{ node: Node; redirect?: never } | { node?: never; redirect: string }> {
    if ((hash === "/login" || hash === "/account") && api.hasIdentityAuth()) {
      await import("./ob-auth-page");
      const page = document.createElement("ob-auth-page");
      page.setAttribute("route", hash === "/account" ? "account" : "login");
      const returnTo = safeReturnTo(params.get("return"));
      if (returnTo) page.setAttribute("return-to", returnTo);
      return { node: page };
    }
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

function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.slice(1) || "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value.split("#")[0];
}

customElements.define("ob-route-outlet", ObRouteOutlet);
