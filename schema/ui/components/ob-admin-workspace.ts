/**
 * <ob-admin-workspace entity="production" record-id="1"> - Graph-derived admin workspace.
 */
import { ObApi, type AdminWorkspace, type EntityGraphEdge, type EntityGraphNode } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldDisplayLabel, formatValue, labelFor, orderedSchemaFields, pluralDisplayName, statusClass } from "../format";
import { stylesheetLink } from "../style-link";
import { displayOperation, operationAvailability } from "../workflow";
import "./ob-entity-list";

type ChildCollection = {
  entity: string;
  parentField: string;
  edge: EntityGraphEdge;
  rows: Record<string, unknown>[];
  temporalFields: string[];
};

type MatrixPanel = {
  entity: string;
  rowEntity: string;
  columnEntity: string;
  rowField: string;
  columnField: string;
  rows: Record<string, unknown>[];
  columns: Record<string, unknown>[];
  cells: Map<string, Record<string, unknown>>;
};

type MaterialPanel = {
  entity: string;
  rows: Record<string, unknown>[];
  versionEntity: string;
  versionField: string;
  versionsByParent: Map<string, Record<string, unknown>[]>;
};

type PeoplePanel = {
  entity: string;
  rows: Record<string, unknown>[];
  calls: Record<string, unknown>[];
};

type RecordContext = {
  children: ChildCollection[];
  schedules: ChildCollection[];
  matrices: MatrixPanel[];
  materials: MaterialPanel | null;
  people: PeoplePanel | null;
  lists: ChildCollection[];
};

export class ObAdminWorkspace extends HTMLElement {
  private _scheduleModes: Record<string, "calendar" | "list"> = {};
  private _confirmOperation = "";
  private _operationStatus = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["entity", "record-id"];
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

  private get recordId(): string {
    return this.getAttribute("record-id") || "";
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
    if (this.recordId) {
      await this._renderRecord(api, workspace);
      return;
    }
    this._renderCollection(api, workspace, schema);
  }

  private _renderCollection(api: ObApi, workspace: AdminWorkspace, schema: any) {
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

  private async _renderRecord(api: ObApi, workspace: AdminWorkspace) {
    const res = await api.request(`/api/${this.entity}s/${this.recordId}`);
    if (!res.ok) {
      this.shadowRoot!.innerHTML = `${stylesheetLink()}<p>Record not found.</p>`;
      return;
    }

    const record = await res.json();
    if (!api.can(this.entity, "read", record)) {
      this.shadowRoot!.innerHTML = `${stylesheetLink()}<p>You do not have access to this record.</p>`;
      return;
    }

    const context = await loadRecordContext(api, workspace, record);
    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <section class="workspace record-workspace">
        <div class="workspace-header">
          <div>
            <div class="eyebrow">${escapeHtml(workspace.label)}</div>
            <h1>${escapeHtml(labelFor(record))}</h1>
          </div>
          <div class="workspace-actions">
            <a class="btn" href="#/workspaces/${escapeAttr(this.entity)}">All ${escapeHtml(workspace.label)}</a>
            <a class="btn secondary" href="#/${escapeAttr(this.entity)}s/${escapeAttr(this.recordId)}/edit?return=${escapeAttr(returnPath(this.entity, this.recordId))}">Edit</a>
          </div>
        </div>
        <div class="record-panels">
          ${this._renderOverview(api, record)}
          ${context.schedules.map((child) => this._renderSchedule(api, child)).join("")}
          ${context.people ? this._renderPeople(api, context.people) : ""}
          ${context.matrices.map((panel) => this._renderMatrix(api, panel)).join("")}
          ${context.materials ? this._renderMaterials(api, context.materials) : ""}
          ${context.lists.map((child) => this._renderChildList(api, child)).join("")}
        </div>
      </section>
    `;
    this._bindRecordActions();
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

  private _renderOverview(api: ObApi, record: Record<string, unknown>): string {
    const schema = api.getSchema(this.entity);
    const fields = orderedSchemaFields(schema)
      .filter(([field]) => !["id", "created_at", "updated_at"].includes(field));
    const operations = this._operationViews(api, this.entity, record);
    return `
      <section class="record-panel overview-panel" aria-label="Overview">
        <div class="panel-header">
          <div>
            <h2>Overview</h2>
            <p>${escapeHtml(displayName(this.entity))} #${escapeHtml(this.recordId)}</p>
          </div>
          ${this._renderOperationButtons(this.entity, this.recordId, operations)}
        </div>
        <dl class="detail-fields">
          ${fields.map(([field, prop]) => `
            <dt>${escapeHtml(fieldDisplayLabel(field, prop))}</dt>
            <dd>${renderFormattedValue(field, record[field], prop)}</dd>
          `).join("")}
        </dl>
        ${this._renderPendingConfirmation()}
        ${this._operationStatus ? `<div class="status-line" role="status">${escapeHtml(this._operationStatus)}</div>` : ""}
      </section>
    `;
  }

  private _renderSchedule(api: ObApi, child: ChildCollection): string {
    const mode = this._scheduleModes[child.entity] || "calendar";
    const schema = api.getSchema(child.entity);
    const startField = child.temporalFields.find((field) => field.includes("start")) || child.temporalFields[0];
    const endField = child.temporalFields.find((field) => field.includes("end")) || "";
    const rows = [...child.rows].sort((a, b) => String(a[startField] || "").localeCompare(String(b[startField] || "")));
    return `
      <section class="record-panel schedule-panel" aria-label="${escapeAttr(pluralDisplayName(child.entity))}">
        ${panelTitle(pluralDisplayName(child.entity), `${rows.length} scheduled`, createHref(child.entity, { [child.parentField]: this.recordId }, returnPath(this.entity, this.recordId)))}
        <div class="segmented" role="group" aria-label="${escapeAttr(pluralDisplayName(child.entity))} view">
          ${["calendar", "list"].map((candidate) => `<button type="button" data-schedule="${escapeAttr(child.entity)}" data-mode="${candidate}" class="${mode === candidate ? "active" : ""}">${escapeHtml(displayOperation(candidate))}</button>`).join("")}
        </div>
        ${mode === "calendar" ? `
          <div class="timeline">
            ${rows.map((row) => `
              <a class="timeline-item" href="${escapeAttr(recordHref(api, child.entity, row.id))}">
                <time>${escapeHtml(formatValue(startField, row[startField], schema?.properties?.[startField]))}</time>
                <strong>${escapeHtml(labelFor(row))}</strong>
                ${endField ? `<span>${escapeHtml(formatValue(endField, row[endField], schema?.properties?.[endField]))}</span>` : ""}
              </a>
            `).join("") || emptyText("No scheduled records yet.")}
          </div>
        ` : compactRows(api, child.entity, rows)}
      </section>
    `;
  }

  private _renderPeople(api: ObApi, panel: PeoplePanel): string {
    return `
      <section class="record-panel people-panel" aria-label="People">
        ${panelTitle("People", `${panel.rows.length} members, ${panel.calls.length} calls`, createHref(panel.entity, { [`${this.entity}_id`]: this.recordId }, returnPath(this.entity, this.recordId)), `New ${displayName(contextualEntityName(panel.entity, this.entity, null))}`)}
        <div class="compact-list">
          ${panel.rows.map((row) => compactRow(api, panel.entity, row)).join("") || emptyText("No people records yet.")}
        </div>
        ${panel.calls.length > 0 ? `
          <div class="call-summary">
            ${statusCounts(panel.calls, "call_status").map(([status, count]) => `<span class="chip">${escapeHtml(status)}: ${count}</span>`).join("")}
          </div>
        ` : ""}
      </section>
    `;
  }

  private _renderMatrix(api: ObApi, panel: MatrixPanel): string {
    return `
      <section class="record-panel matrix-panel" aria-label="${escapeAttr(matrixTitle(panel.entity))}">
        ${panelTitle(matrixTitle(panel.entity), `${panel.rows.length} x ${panel.columns.length}`, createHref(panel.rowEntity, { [`${this.entity}_id`]: this.recordId }, returnPath(this.entity, this.recordId)), `New ${displayName(panel.rowEntity)}`)}
        <div class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th scope="col">${escapeHtml(displayName(panel.rowEntity))}</th>
                ${panel.columns.map((column) => `<th scope="col">${escapeHtml(labelFor(column))}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${panel.rows.map((row) => `
                <tr>
                  <th scope="row">${escapeHtml(labelFor(row))}</th>
                  ${panel.columns.map((column) => this._renderMatrixCell(api, panel, row, column)).join("")}
                </tr>
              `).join("") || `<tr><td colspan="${panel.columns.length + 1}">${emptyText("Add rows and columns to populate this matrix.")}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private _renderMatrixCell(api: ObApi, panel: MatrixPanel, row: Record<string, unknown>, column: Record<string, unknown>): string {
    const cell = panel.cells.get(matrixKey(row.id, column.id));
    if (!cell) {
      return `<td><a class="matrix-add" href="${escapeAttr(createHref(panel.entity, { [panel.rowField]: row.id, [panel.columnField]: column.id }, returnPath(this.entity, this.recordId)))}">Add</a></td>`;
    }

    const operations = this._operationViews(api, panel.entity, cell);
    return `
      <td>
        <div class="matrix-cell">
          ${renderFormattedValue("status", cell.status || cell.call_status || "set", api.getSchema(panel.entity)?.properties?.status)}
          <a href="${escapeAttr(recordHref(api, panel.entity, cell.id))}">Open</a>
          ${this._renderOperationButtons(panel.entity, String(cell.id), operations, "compact")}
        </div>
      </td>
    `;
  }

  private _renderMaterials(api: ObApi, panel: MaterialPanel): string {
    return `
      <section class="record-panel materials-panel" aria-label="Materials">
        ${panelTitle("Materials", `${panel.rows.length} records`, createHref(panel.entity, { [`${this.entity}_id`]: this.recordId }, returnPath(this.entity, this.recordId)))}
        <div class="material-list">
          ${panel.rows.map((row) => {
            const versions = panel.versionsByParent.get(String(row.id)) || [];
            const current = versions.find((version) => String(version.status) === "current") || versions[0];
            return `
              <article class="material-card">
                <div>
                  <h3><a href="${escapeAttr(recordHref(api, panel.entity, row.id))}">${escapeHtml(labelFor(row))}</a></h3>
                  <p>${escapeHtml([row.kind, row.status].filter(Boolean).join(" / "))}</p>
                </div>
                ${current ? `
                  <div class="version-note">
                    <strong>${escapeHtml(String(current.version_label || current.id))}</strong>
                    <span>${escapeHtml(String(current.storage_uri || current.status || ""))}</span>
                  </div>
                ` : `<span class="muted">No versions yet</span>`}
              </article>
            `;
          }).join("") || emptyText("No materials yet.")}
        </div>
      </section>
    `;
  }

  private _renderChildList(api: ObApi, child: ChildCollection): string {
    return `
      <section class="record-panel list-panel" aria-label="${escapeAttr(pluralDisplayName(child.entity))}">
        ${panelTitle(contextualPluralDisplayName(child.entity, this.entity, child.edge), `${child.rows.length} records`, createHref(child.entity, { [child.parentField]: this.recordId }, returnPath(this.entity, this.recordId)))}
        ${compactRows(api, child.entity, child.rows)}
      </section>
    `;
  }

  private _renderOperationButtons(entity: string, id: string, operations: OperationView[], mode: "normal" | "compact" = "normal"): string {
    if (operations.length === 0) return "";
    return `
      <div class="${mode === "compact" ? "inline-actions" : "panel-actions"}">
        ${operations.map((operation) => `
          <button type="button" class="secondary workspace-op" data-entity="${escapeAttr(entity)}" data-id="${escapeAttr(id)}" data-op="${escapeAttr(operation.op)}" title="${escapeAttr(operation.available ? operation.description : operation.unavailableReason)}" ${operation.available ? "" : "disabled"}>${escapeHtml(operation.label)}</button>
        `).join("")}
      </div>
    `;
  }

  private _renderPendingConfirmation(): string {
    if (!this._confirmOperation) return "";
    return `
      <div class="operation-confirm warning" role="alert">
        <strong>Confirm action</strong>
        <span>This operation asks for confirmation before it runs.</span>
        <div class="confirm-actions">
          <button class="primary" type="button" data-action="confirm-operation">Confirm</button>
          <button type="button" data-action="cancel-operation">Cancel</button>
        </div>
      </div>
    `;
  }

  private _operationViews(api: ObApi, entity: string, record: Record<string, unknown>): OperationView[] {
    return api.getOperations(entity).map((op) => {
      const policy = api.getOperationPolicy(entity, op) || {};
      const workflow = api.getOperationWorkflow(entity, op) || {};
      const availability = operationAvailability(record, workflow, policy.label || displayOperation(op));
      return {
        op,
        label: policy.label || displayOperation(op),
        description: policy.description || workflow.audit?.summary || "",
        workflow,
        available: availability.available,
        unavailableReason: availability.reason,
      };
    }).filter((operation) => api.can(entity, operation.op, record));
  }

  private _bindRecordActions() {
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-schedule][data-mode]").forEach((button) => {
      button.addEventListener("click", async () => {
        const entity = button.dataset.schedule || "";
        const mode = button.dataset.mode === "list" ? "list" : "calendar";
        this._scheduleModes[entity] = mode;
        await this._render();
      });
    });

    this.shadowRoot!.querySelectorAll<HTMLButtonElement>(".workspace-op").forEach((button) => {
      button.addEventListener("click", () => this._runOperation(button.dataset.entity || "", button.dataset.id || "", button.dataset.op || ""));
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="confirm-operation"]')?.addEventListener("click", () => {
      const [entity, id, op] = this._confirmOperation.split(":");
      this._runOperation(entity, id, op, true);
    });
    this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="cancel-operation"]')?.addEventListener("click", async () => {
      this._confirmOperation = "";
      await this._render();
    });
  }

  private async _runOperation(entity: string, id: string, op: string, confirmed = false) {
    if (!entity || !id || !op) return;
    const api = ObApi.instance!;
    const workflow = api.getOperationWorkflow(entity, op);
    const key = `${entity}:${id}:${op}`;
    if (workflow?.confirmation?.required && !confirmed) {
      this._confirmOperation = key;
      await this._render();
      return;
    }
    this._confirmOperation = "";
    this._operationStatus = "";
    const res = await api.request(`/api/${entity}s/${id}/${op}`, { method: "POST" });
    this._operationStatus = res.ok ? `${displayOperation(op)} completed.` : ((await res.json().catch(() => null))?.error || `${displayOperation(op)} failed.`);
    await this._render();
  }
}

type OperationView = {
  op: string;
  label: string;
  description: string;
  workflow: any;
  available: boolean;
  unavailableReason: string;
};

async function loadRecordContext(api: ObApi, workspace: AdminWorkspace, record: Record<string, unknown>): Promise<RecordContext> {
  const graph = api.getEntityGraph();
  const nodeByEntity = new Map(graph.nodes.map((node) => [node.entity, node]));
  const parentId = String(record.id);
  const children = (await Promise.all(workspace.inbound
    .filter((edge) => api.canCollection(edge.sourceEntity, "read"))
    .map(async (edge) => {
      const rows = await fetchList(api, edge.sourceEntity, { [edge.sourceField]: parentId, limit: "500" });
      return {
        entity: edge.sourceEntity,
        parentField: edge.sourceField,
        edge,
        rows,
        temporalFields: nodeByEntity.get(edge.sourceEntity)?.temporalFields || [],
      };
    }))).filter((child) => child.rows.length > 0 || api.canCollection(child.entity, "create"));

  const schedules = children.filter((child) => child.temporalFields.length > 0);
  const matrices = await inferMatrices(api, graph.nodes, children);
  const materials = await inferMaterials(api, graph.nodes, children);
  const people = await inferPeople(api, graph.nodes, children, schedules);

  const handled = new Set<string>();
  schedules.forEach((child) => handled.add(child.entity));
  matrices.forEach((matrix) => {
    handled.add(matrix.rowEntity);
    handled.add(matrix.columnEntity);
    handled.add(matrix.entity);
  });
  if (materials) handled.add(materials.entity);
  if (people) handled.add(people.entity);

  return {
    children,
    schedules,
    matrices,
    materials,
    people,
    lists: children.filter((child) => !handled.has(child.entity)),
  };
}

async function inferMatrices(api: ObApi, nodes: EntityGraphNode[], children: ChildCollection[]): Promise<MatrixPanel[]> {
  const childByEntity = new Map(children.map((child) => [child.entity, child]));
  const panels: MatrixPanel[] = [];
  for (const node of nodes) {
    if (!api.canCollection(node.entity, "read")) continue;
    if (/call|attendance/.test(node.entity)) continue;
    const edges = node.outbound.filter((edge) => childByEntity.has(edge.targetEntity));
    if (edges.length < 2) continue;
    const pair = orientMatrixEdges(edges, childByEntity);
    if (!pair) continue;
    const cells = await fetchList(api, node.entity, { limit: "500" });
    const rowIds = new Set(pair.rowChild.rows.map((row) => String(row.id)));
    const columnIds = new Set(pair.columnChild.rows.map((row) => String(row.id)));
    panels.push({
      entity: node.entity,
      rowEntity: pair.rowEdge.targetEntity,
      columnEntity: pair.columnEdge.targetEntity,
      rowField: pair.rowEdge.sourceField,
      columnField: pair.columnEdge.sourceField,
      rows: pair.rowChild.rows,
      columns: pair.columnChild.rows,
      cells: new Map(cells
        .filter((cell) => rowIds.has(String(cell[pair.rowEdge.sourceField])) && columnIds.has(String(cell[pair.columnEdge.sourceField])))
        .map((cell) => [matrixKey(cell[pair.rowEdge.sourceField], cell[pair.columnEdge.sourceField]), cell])),
    });
  }
  return panels;
}

function orientMatrixEdges(edges: EntityGraphEdge[], childByEntity: Map<string, ChildCollection>) {
  const [a, b] = edges;
  const aChild = childByEntity.get(a.targetEntity)!;
  const bChild = childByEntity.get(b.targetEntity)!;
  const aTemporal = aChild.temporalFields.length > 0;
  const bTemporal = bChild.temporalFields.length > 0;
  const aRequirement = /requirement|task|item/.test(a.targetEntity);
  const bRequirement = /requirement|task|item/.test(b.targetEntity);
  const rowFirst = (aRequirement && !bRequirement) || (!aTemporal && bTemporal);
  return rowFirst
    ? { rowEdge: a, columnEdge: b, rowChild: aChild, columnChild: bChild }
    : { rowEdge: b, columnEdge: a, rowChild: bChild, columnChild: aChild };
}

async function inferMaterials(api: ObApi, nodes: EntityGraphNode[], children: ChildCollection[]): Promise<MaterialPanel | null> {
  const material = children.find((child) => /material|document|asset/.test(child.entity));
  if (!material) return null;
  const version = nodes.find((node) =>
    /version|revision/.test(node.entity)
    && api.canCollection(node.entity, "read")
    && node.outbound.some((edge) => edge.targetEntity === material.entity)
  );
  const versionEdge = version?.outbound.find((edge) => edge.targetEntity === material.entity);
  const versionsByParent = new Map<string, Record<string, unknown>[]>();
  if (version && versionEdge) {
    await Promise.all(material.rows.map(async (row) => {
      versionsByParent.set(String(row.id), await fetchList(api, version.entity, { [versionEdge.sourceField]: String(row.id), limit: "50" }));
    }));
  }
  return {
    entity: material.entity,
    rows: material.rows,
    versionEntity: version?.entity || "",
    versionField: versionEdge?.sourceField || "",
    versionsByParent,
  };
}

async function inferPeople(api: ObApi, nodes: EntityGraphNode[], children: ChildCollection[], schedules: ChildCollection[]): Promise<PeoplePanel | null> {
  const people = children.find((child) =>
    /member|participant/.test(child.entity)
    || child.edge.sourceEntity.includes("artist")
    || (nodes.find((node) => node.entity === child.entity)?.outbound || []).some((edge) => /artist|user|person|principal/.test(edge.targetEntity))
  );
  if (!people) return null;

  const calls: Record<string, unknown>[] = [];
  for (const schedule of schedules) {
    const callNode = nodes.find((node) => /call|attendance/.test(node.entity) && node.outbound.some((edge) => edge.targetEntity === schedule.entity));
    const callEdge = callNode?.outbound.find((edge) => edge.targetEntity === schedule.entity);
    if (!callNode || !callEdge || !api.canCollection(callNode.entity, "read")) continue;
    const scheduleIds = new Set(schedule.rows.map((row) => String(row.id)));
    const rows = await fetchList(api, callNode.entity, { limit: "500" });
    calls.push(...rows.filter((row) => scheduleIds.has(String(row[callEdge.sourceField]))));
  }
  return { entity: people.entity, rows: people.rows, calls };
}

async function fetchList(api: ObApi, entity: string, params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  const res = await api.request(`/api/${entity}s?${query}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
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

function recordHref(api: ObApi, entity: string, id: unknown): string {
  return api.getAdminWorkspace(entity) ? `#/workspaces/${entity}/${id}` : `#/${entity}s/${id}`;
}

function createHref(entity: string, defaults: Record<string, unknown>, returnTo: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(defaults)) params.set(key, String(value));
  params.set("return", returnTo);
  return `#/${entity}s/new?${params}`;
}

function returnPath(entity: string, id: string): string {
  return `/workspaces/${entity}/${id}`;
}

function compactRows(api: ObApi, entity: string, rows: Record<string, unknown>[]): string {
  return `<div class="compact-list">${rows.map((row) => compactRow(api, entity, row)).join("") || emptyText("No records yet.")}</div>`;
}

function compactRow(api: ObApi, entity: string, row: Record<string, unknown>): string {
  return `
    <a class="compact-row" href="${escapeAttr(recordHref(api, entity, row.id))}">
      <span>${escapeHtml(labelFor(row))}</span>
      ${row.status || row.call_status ? renderFormattedValue("status", row.status || row.call_status, api.getSchema(entity)?.properties?.status) : `<strong>#${escapeHtml(row.id)}</strong>`}
    </a>
  `;
}

function panelTitle(title: string, meta: string, createUrl: string, createLabel?: string): string {
  return `
    <div class="panel-header">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(meta)}</p>
      </div>
      <a class="btn secondary" href="${escapeAttr(createUrl)}">${escapeHtml(createLabel || `New ${title.replace(/s$/, "")}`)}</a>
    </div>
  `;
}

function renderFormattedValue(field: string, value: unknown, prop?: any): string {
  if (value === null || value === undefined || value === "") return `<span class="muted">-</span>`;
  const formatted = formatValue(field, value, prop);
  if (field === "status" || field === "call_status" || ["active", "used", "revoked"].includes(field)) {
    return `<span class="badge ${statusClass(field, value)}">${escapeHtml(formatted)}</span>`;
  }
  return escapeHtml(formatted);
}

function emptyText(text: string): string {
  return `<div class="empty-state"><span>${escapeHtml(text)}</span></div>`;
}

function statusCounts(rows: Record<string, unknown>[], field: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = String(row[field] || "unknown");
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return [...counts.entries()].sort();
}

function matrixKey(rowId: unknown, columnId: unknown): string {
  return `${rowId}:${columnId}`;
}

function matrixTitle(entity: string): string {
  if (entity.includes("coverage")) return "Coverage matrix";
  if (entity.includes("call")) return "Call matrix";
  return `${displayName(entity)} matrix`;
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
