/**
 * Barrel export — registers all custom elements.
 */
export { ObApi } from "./components/ob-api";
export { ObNav } from "./components/ob-nav";
export { ObEntityList } from "./components/ob-entity-list";
export { ObEntityForm } from "./components/ob-entity-form";
export { ObEntityDetail } from "./components/ob-entity-detail";
export { ObOperationBtn } from "./components/ob-operation-btn";
export { ObCommerce } from "./components/ob-commerce";

import { ObApi } from "./components/ob-api";

/**
 * Simple hash router — renders the right component into #content.
 */
function route() {
  const content = document.getElementById("content");
  if (!content) return;

  const hash = location.hash.slice(1) || "/";
  const render = (html: string) => {
    content.innerHTML = html;
    content.focus({ preventScroll: true });
  };

  // Routes: /<entity>s, /<entity>s/new, /<entity>s/:id, /<entity>s/:id/edit
  let m: RegExpMatchArray | null;

  if (hash === "/commerce") {
    render(`<ob-commerce></ob-commerce>`);
    return;
  }

  if ((m = hash.match(/^\/([a-z_]+s)\/new$/))) {
    const entity = m[1].replace(/s$/, "");
    render(`<ob-entity-form entity="${entity}" mode="create"></ob-entity-form>`);
    return;
  }

  if ((m = hash.match(/^\/([a-z_]+s)\/(\d+)\/edit$/))) {
    const entity = m[1].replace(/s$/, "");
    render(`<ob-entity-form entity="${entity}" mode="edit" record-id="${m[2]}"></ob-entity-form>`);
    return;
  }

  if ((m = hash.match(/^\/([a-z_]+s)\/(\d+)$/))) {
    const entity = m[1].replace(/s$/, "");
    render(`<ob-entity-detail entity="${entity}" record-id="${m[2]}"></ob-entity-detail>`);
    return;
  }

  if ((m = hash.match(/^\/([a-z_]+s)$/))) {
    const entity = m[1].replace(/s$/, "");
    render(`<ob-entity-list entity="${entity}"></ob-entity-list>`);
    return;
  }

  // Default: show welcome or redirect to first entity
  const api = ObApi.instance;
  if (api?.spec) {
    const entities = api.getEntities().filter(
      (e) => !e.startsWith("identity_") && e !== "api_key"
    );
    if (entities.length > 0) {
      location.hash = `#/${entities[0]}s`;
      return;
    }
  }
  render(`<p style="padding:40px;color:#68675f">Select an entity from the sidebar.</p>`);
}

// Initialize router after spec loads
document.addEventListener("ob-spec-ready", () => {
  route();
  window.addEventListener("hashchange", route);
});
