/**
 * <ob-admin-route-outlet> - Admin dashboard router for generated data views.
 */
import { ObApi } from "./ob-api";
import "./ob-entity-detail";
import "./ob-entity-form";
import "./ob-entity-list";

const INTERNAL_PREFIXES = ["identity_", "api_key"];

export class ObAdminRouteOutlet extends HTMLElement {
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
    const content = this._content();
    if (!content) return;

    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const hash = location.hash.slice(1) || "/";
    const routed = this._match(hash, api);
    if (routed.redirect) {
      location.hash = routed.redirect;
      return;
    }

    content.replaceChildren(routed.node);
    this.focusContent();
  }

  private _match(hash: string, api: ObApi): { node: Node; redirect?: never } | { node?: never; redirect: string } {
    let match: RegExpMatchArray | null;

    if ((match = hash.match(/^\/([a-z_]+s)\/new$/))) {
      return { node: entityElement("ob-entity-form", match[1], { mode: "create" }) };
    }

    if ((match = hash.match(/^\/([a-z_]+s)\/(\d+)\/edit$/))) {
      return { node: entityElement("ob-entity-form", match[1], { mode: "edit", "record-id": match[2] }) };
    }

    if ((match = hash.match(/^\/([a-z_]+s)\/(\d+)$/))) {
      return { node: entityElement("ob-entity-detail", match[1], { "record-id": match[2] }) };
    }

    if ((match = hash.match(/^\/([a-z_]+s)$/))) {
      return { node: entityElement("ob-entity-list", match[1]) };
    }

    const entities = api.getEntities().filter((entity) => !INTERNAL_PREFIXES.some((prefix) => entity.startsWith(prefix)));
    if (entities.length > 0) return { redirect: `#/${entities[0]}s` };

    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No admin data views are available for this composition.";
    return { node: empty };
  }
}

function entityElement(tagName: string, pluralEntity: string, attrs: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tagName);
  element.setAttribute("entity", pluralEntity.replace(/s$/, ""));
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

customElements.define("ob-admin-route-outlet", ObAdminRouteOutlet);
