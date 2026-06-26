/**
 * <ob-admin-route-outlet> - Admin dashboard router for generated data views.
 */
import { ObApi } from "./ob-api";
import { parseHash, safeReturnTo } from "../route";

export class ObAdminRouteOutlet extends HTMLElement {
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
    let match: RegExpMatchArray | null;

    if ((hash === "/login" || hash === "/account") && api.hasIdentityAuth()) {
      await import("./ob-auth-page");
      const page = document.createElement("ob-auth-page");
      page.setAttribute("context", "admin");
      page.setAttribute("route", hash === "/account" ? "account" : "login");
      const returnTo = safeReturnTo(params.get("return"));
      if (returnTo) page.setAttribute("return-to", returnTo);
      return { node: page };
    }

    if ((match = hash.match(/^\/workflows\/([A-Za-z0-9_-]+)$/))) {
      await import("./ob-workflow-board");
      const board = document.createElement("ob-workflow-board");
      board.setAttribute("workflow", match[1]);
      return { node: board };
    }

    if (hash === "/calendar") {
      await import("./ob-admin-calendar");
      return { node: document.createElement("ob-admin-calendar") };
    }

    if ((match = hash.match(/^\/workspaces\/([a-z_]+)$/))) {
      await import("./ob-admin-workspace");
      const workspace = document.createElement("ob-admin-workspace");
      workspace.setAttribute("entity", match[1]);
      return { node: workspace };
    }

    if ((match = hash.match(/^\/workspaces\/([a-z_]+)\/(\d+)$/))) {
      await import("./ob-admin-workspace");
      const workspace = document.createElement("ob-admin-workspace");
      workspace.setAttribute("entity", match[1]);
      workspace.setAttribute("record-id", match[2]);
      return { node: workspace };
    }

    if ((match = hash.match(/^\/([a-z_]+s)\/new$/))) {
      await import("./ob-entity-form");
      return { node: entityElement("ob-entity-form", match[1], formRouteAttrs(params, { mode: "create" })) };
    }

    if ((match = hash.match(/^\/([a-z_]+s)\/(\d+)\/edit$/))) {
      await import("./ob-entity-form");
      return { node: entityElement("ob-entity-form", match[1], formRouteAttrs(params, { mode: "edit", "record-id": match[2] })) };
    }

    if ((match = hash.match(/^\/([a-z_]+s)$/))) {
      await import("./ob-entity-list");
      const filter = params.toString();
      const attrs = filter ? { filter } : {};
      return { node: entityElement("ob-entity-list", match[1], attrs) };
    }

    const empty = document.createElement("p");
    empty.className = "empty";
    if (hash !== "/") {
      empty.textContent = "No admin view exists for this route.";
      return { node: empty };
    }

    const firstItem = api.getAdminWorkspaces()[0] || api.getNavigationItems()[0];
    if (firstItem) return { redirect: firstItem.path };

    empty.textContent = "No admin data views are available for this composition.";
    return { node: empty };
  }
}

function entityElement(tagName: string, pluralEntity: string, attrs: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tagName);
  element.setAttribute("entity", singularEntity(pluralEntity));
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function singularEntity(pluralEntity: string): string {
  return pluralEntity.replace(/s$/, "");
}

function formRouteAttrs(params: URLSearchParams, attrs: Record<string, string>): Record<string, string> {
  const next = { ...attrs };
  const returnTo = safeReturnTo(params.get("return"));
  const defaults = new URLSearchParams(params);
  defaults.delete("return");
  if (returnTo) next["return-to"] = returnTo;
  if ([...defaults.keys()].length > 0) next.defaults = defaults.toString();
  return next;
}

customElements.define("ob-admin-route-outlet", ObAdminRouteOutlet);
