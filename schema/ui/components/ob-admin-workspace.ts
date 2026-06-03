/**
 * <ob-admin-workspace entity="production"> - Graph-derived admin workspace.
 */
import { ObApi, type AdminWorkspace, type EntityGraphEdge } from "./ob-api";
import { escapeAttr, escapeHtml, fieldDisplayLabel, pluralDisplayName } from "../format";
import { stylesheetLink } from "../style-link";
import "./ob-entity-list";

export class ObAdminWorkspace extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["entity"];
  }

  async connectedCallback() {
    await this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  private get entity(): string {
    return this.getAttribute("entity") || "";
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api || !this.entity) return;
    await api.ready();

    const schema = api.getSchema(this.entity);
    if (!schema) {
      this.shadowRoot!.innerHTML = `${stylesheetLink()}<p>Unknown workspace: ${escapeHtml(this.entity)}</p>`;
      return;
    }

    const workspace = api.getAdminWorkspace(this.entity) || fallbackWorkspace(api, this.entity);
    const inbound = workspace.inbound.filter((edge) => api.canCollection(edge.sourceEntity, "read"));
    const outbound = workspace.outbound.filter((edge) => api.canCollection(edge.targetEntity, "read"));
    const workflows = workspace.workflowScreens.filter((screen) => api.canCollection(screen.entity, "read"));
    const supportEntities = workspace.supportEntities.filter((entity) => api.canCollection(entity, "read"));
    const temporalFields = workspace.temporalFields
      .map((field) => fieldDisplayLabel(field, schema.properties?.[field]))
      .filter(Boolean);

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <section class="workspace">
        <div class="workspace-header">
          <div>
            <div class="eyebrow">${escapeHtml(groupLabel(api, workspace.group))}</div>
            <h1>${escapeHtml(workspace.label)}</h1>
          </div>
          <div class="workspace-actions">
            <a class="btn" href="#/${escapeAttr(this.entity)}s">Table</a>
            ${workflows.map((screen) => `<a class="btn secondary" href="${escapeAttr(screen.path)}">${escapeHtml(screen.label)}</a>`).join("")}
          </div>
        </div>
        ${this._renderContext({ inbound, outbound, supportEntities, temporalFields, api })}
        <ob-entity-list entity="${escapeAttr(this.entity)}"></ob-entity-list>
      </section>
    `;
  }

  private _renderContext(
    context: {
      inbound: EntityGraphEdge[];
      outbound: EntityGraphEdge[];
      supportEntities: string[];
      temporalFields: string[];
      api: ObApi;
    },
  ): string {
    const panels = [
      this._renderEdges("Related collections", context.inbound, "inbound", context.api),
      this._renderEdges("References", context.outbound, "outbound", context.api),
      this._renderSupport(context.supportEntities),
      this._renderTemporal(context.temporalFields),
    ].filter(Boolean);

    if (panels.length === 0) return "";
    return `<div class="workspace-grid">${panels.join("")}</div>`;
  }

  private _renderEdges(title: string, edges: EntityGraphEdge[], direction: "inbound" | "outbound", api: ObApi): string {
    if (edges.length === 0) return "";
    return `
      <section class="workspace-panel" aria-label="${escapeAttr(title)}">
        <h2>${escapeHtml(title)}</h2>
        <div class="link-grid">
          ${edges.map((edge) => {
            const entity = direction === "inbound" ? edge.sourceEntity : edge.targetEntity;
            const href = workspaceHref(api, entity);
            const label = contextualPluralDisplayName(entity, this.entity, direction === "inbound" ? edge : null);
            const hint = relationshipHint(edge, direction, this.entity);
            return `
              <a class="link-card" href="${escapeAttr(href)}">
                <strong>${escapeHtml(label)}</strong>
                ${hint ? `<span>${escapeHtml(hint)}</span>` : ""}
              </a>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  private _renderSupport(entities: string[]): string {
    if (entities.length === 0) return "";
    return `
      <section class="workspace-panel" aria-label="Supporting records">
        <h2>Supporting records</h2>
        <div class="link-grid">
          ${entities.map((entity) => `
            <a class="link-card" href="#/${escapeAttr(entity)}s">
              <strong>${escapeHtml(contextualPluralDisplayName(entity, this.entity))}</strong>
              <span>Context</span>
            </a>
          `).join("")}
        </div>
      </section>
    `;
  }

  private _renderTemporal(fields: string[]): string {
    if (fields.length === 0) return "";
    return `
      <section class="workspace-panel" aria-label="Schedule fields">
        <h2>Schedule fields</h2>
        <div class="chip-row">
          ${fields.map((field) => `<span class="chip">${escapeHtml(field)}</span>`).join("")}
        </div>
      </section>
    `;
  }
}

function fallbackWorkspace(api: ObApi, entity: string): AdminWorkspace {
  const node = api.getEntityGraph({ includeInternal: true }).nodes.find((candidate) => candidate.entity === entity);
  return {
    entity,
    path: `#/workspaces/${entity}`,
    label: pluralDisplayName(entity),
    group: "data",
    internal: api.isInternalEntity(entity),
    displayPriority: 1000,
    inbound: node?.inbound || [],
    outbound: node?.outbound || [],
    related: [...(node?.inbound || []), ...(node?.outbound || [])],
    temporalFields: node?.temporalFields || [],
    workflowScreens: node?.workflowScreens || [],
    supportEntities: [],
  };
}

function workspaceHref(api: ObApi, entity: string): string {
  return api.getAdminWorkspace(entity) ? `#/workspaces/${entity}` : `#/${entity}s`;
}

function contextualPluralDisplayName(entity: string, contextEntity: string, edge: EntityGraphEdge | null = null): string {
  return pluralDisplayName(contextualEntityName(entity, contextEntity, edge));
}

function contextualEntityName(entity: string, contextEntity: string, edge: EntityGraphEdge | null): string {
  const candidates = [
    contextEntity,
    edge?.sourceField.replace(/_id$/, ""),
    edge?.targetEntity,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const stripped = stripEntityPrefix(entity, candidate);
    if (stripped !== entity) return stripped;
  }
  return entity;
}

function stripEntityPrefix(entity: string, prefix: string): string {
  const entityParts = entity.split("_");
  const prefixParts = prefix.split("_");
  if (prefixParts.length >= entityParts.length) return entity;
  if (!prefixParts.every((part, index) => entityParts[index] === part)) return entity;
  return entityParts.slice(prefixParts.length).join("_") || entity;
}

function relationshipHint(edge: EntityGraphEdge, direction: "inbound" | "outbound", contextEntity: string): string {
  if (direction === "outbound") return edge.label;
  const fieldBase = edge.sourceField.replace(/_id$/, "");
  if (edge.targetEntity === contextEntity && (fieldBase === contextEntity || edge.label.toLowerCase() === contextEntity.replace(/_/g, " "))) {
    return "";
  }
  return edge.label;
}

function groupLabel(api: ObApi, groupId?: string): string {
  const group = api.getAdminWorkspaceGroups({ includeInternal: true }).find((candidate) => candidate.id === groupId);
  return group?.label || "Workspace";
}

customElements.define("ob-admin-workspace", ObAdminWorkspace);
