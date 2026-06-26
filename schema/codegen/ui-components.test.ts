import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { dirname, join, normalize } from "node:path";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { genOpenAPI } from "./openapi";
import { genAdminAppShell, genAppShell, genPublicAppShell } from "./ui";
import { genAdminStylesheet, genPublicStylesheet } from "./ui-styles";
import type { Column, Operation, Schema } from "./types";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const UI_DIR = join(PROJECT_ROOT, "schema", "ui");

const shellSchema: Schema = {
  organization: { name: "Component Shop", description: "Component shell test" },
  tables: {
    user: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
    },
  },
  operations: {},
};

const baseColumn: Column = {
  type: "text",
  pk: false,
  auto: false,
  required: false,
  unique: false,
  default: null,
  references: null,
};

function col(overrides: Partial<Column>): Column {
  return { ...baseColumn, ...overrides };
}

function op(overrides: Partial<Operation> = {}): Operation {
  return { guard: null, relationships: [], public: false, scope: null, policy: {}, workflow: {}, audit: {}, set: {}, cascade: [], effects: [], ...overrides };
}

function navigationSchema(): Schema {
  return {
    organization: { name: "Navigation Test", description: "Navigation metadata test app", logo: null },
    workflows: {
      groups: {
        issueLifecycle: {
          label: "Issue lifecycle",
          displayPriority: 15,
        },
      },
    },
    audit: {
      entities: {
        payment: {
          operations: ["create"],
          category: "payment",
          reason: "Payments require payment-specific handling.",
        },
      },
    },
    tables: {
      user: {
        id: col({ type: "integer", pk: true, auto: true }),
      },
      issue: {
        id: col({ type: "integer", pk: true, auto: true }),
        status: col({ required: true }),
      },
      payment: {
        id: col({ type: "integer", pk: true, auto: true }),
      },
      label: {
        id: col({ type: "integer", pk: true, auto: true }),
      },
      issue_label: {
        id: col({ type: "integer", pk: true, auto: true }),
        issue_id: col({ type: "integer", required: true, references: "issue(id)" }),
        label_id: col({ type: "integer", required: true, references: "label(id)" }),
      },
      api_key: {
        id: col({ type: "integer", pk: true, auto: true }),
      },
      identity_challenge: {
        id: col({ type: "integer", pk: true, auto: true }),
      },
    },
    operations: {
      issue: {
        triage: op({
          workflow: {
            group: "issueLifecycle",
          },
        }),
      },
    },
  };
}

describe("generated UI web components", () => {
  test("app shell delegates layout and routing to web components", () => {
    const shell = genAppShell(shellSchema);

    expect(shell).toContain('<ob-app src="openapi.json"></ob-app>');
    expect(shell).not.toContain('api-base="http://localhost:3085"');
    expect(shell).toContain('<link rel="stylesheet" href="styles.css" />');
    expect(shell).not.toContain('id="content"');
    expect(shell).not.toContain("#content");
    expect(shell).not.toContain("<ob-api");
  });

  test("public and admin app shells target separate web components", () => {
    const publicShell = genPublicAppShell(shellSchema);
    const adminShell = genAdminAppShell(shellSchema);

    expect(publicShell).toContain("<title>Component Shop</title>");
    expect(publicShell).toContain('<ob-app src="openapi.json"></ob-app>');
    expect(publicShell).not.toContain("ob-admin-app");

    expect(adminShell).toContain("<title>Component Shop Admin</title>");
    expect(adminShell).toContain('<ob-admin-app src="openapi.json"></ob-admin-app>');
    expect(adminShell).not.toContain("<ob-app");
  });

  test("component behavior is not wired through id lookups", async () => {
    const componentDir = join(UI_DIR, "components");
    const files = [
      ...(await readdir(UI_DIR)).filter((file) => file.endsWith(".ts")).map((file) => join(UI_DIR, file)),
      ...(await readdir(componentDir)).filter((file) => file.endsWith(".ts")).map((file) => join(componentDir, file)),
    ];

    for (const file of files) {
      const source = await Bun.file(file).text();
      expect(source).not.toContain("getElementById");
      expect(source).not.toContain('document.getElementById');
    }

    const index = await Bun.file(join(UI_DIR, "index.ts")).text();
    expect(index).not.toContain("#content");
    expect(index).toContain('export { ObApp }');
    expect(index).toContain('export { ObAdminApp }');
    expect(index).toContain('export { ObAuthMenu }');
    expect(index).toContain('export { ObAuthPage }');
    expect(index).toContain('export { ObAuthPanel }');
    expect(index).toContain('export { ObAccountSummary }');
    expect(index).toContain('export { ObRouteOutlet }');
    expect(index).toContain('export { ObAdminRouteOutlet }');
    expect(index).toContain('export { ObAdminCalendar }');
    expect(index).toContain('export { ObAdminWorkspace }');
    expect(index).toContain('export { ObWorkflowBoard }');
  });

  test("public and admin bundles are isolated at their entrypoints", async () => {
    const publicEntry = await Bun.file(join(UI_DIR, "public.ts")).text();
    const adminEntry = await Bun.file(join(UI_DIR, "admin.ts")).text();
    const publicApp = await Bun.file(join(UI_DIR, "components", "ob-app.ts")).text();
    const adminApp = await Bun.file(join(UI_DIR, "components", "ob-admin-app.ts")).text();
    const authMenu = await Bun.file(join(UI_DIR, "components", "ob-auth-menu.ts")).text();
    const authPanel = await Bun.file(join(UI_DIR, "components", "ob-auth-panel.ts")).text();
    const authPage = await Bun.file(join(UI_DIR, "components", "ob-auth-page.ts")).text();
    const accountSummary = await Bun.file(join(UI_DIR, "components", "ob-account-summary.ts")).text();
    const entityList = await Bun.file(join(UI_DIR, "components", "ob-entity-list.ts")).text();
    const entityForm = await Bun.file(join(UI_DIR, "components", "ob-entity-form.ts")).text();
    const entityDetail = await Bun.file(join(UI_DIR, "components", "ob-entity-detail.ts")).text();
    const adminWorkspace = await Bun.file(join(UI_DIR, "components", "ob-admin-workspace.ts")).text();
    const adminCalendar = await Bun.file(join(UI_DIR, "components", "ob-admin-calendar.ts")).text();
    const workflowBoard = await Bun.file(join(UI_DIR, "components", "ob-workflow-board.ts")).text();
    const adminNav = await Bun.file(join(UI_DIR, "components", "ob-nav.ts")).text();
    const publicRoute = await Bun.file(join(UI_DIR, "components", "ob-route-outlet.ts")).text();
    const adminRoute = await Bun.file(join(UI_DIR, "components", "ob-admin-route-outlet.ts")).text();

    expect(publicEntry).toContain("./components/ob-app");
    expect(publicEntry).not.toContain("ob-admin-app");
    expect(publicEntry).not.toContain("./index");
    expect(adminEntry).toContain("./components/ob-admin-app");
    expect(adminEntry).not.toContain("ob-app");
    expect(adminEntry).not.toContain("./index");
    expect(publicApp).toContain("../shell");
    expect(publicApp).toContain("./ob-auth-menu");
    expect(publicApp).not.toContain("function escapeAttr");
    expect(adminApp).toContain("../shell");
    expect(adminApp).not.toContain("ob-auth-menu");
    expect(adminApp).not.toContain("function escapeAttr");
    expect(adminNav).toContain("./ob-auth-menu");
    expect(adminNav).toContain("getAdminWorkspaces");
    expect(adminNav).toContain("getAdminWorkspaceGroups");
    expect(adminNav).toContain("getAdminTemporalEntities");
    expect(adminNav).toContain('data-href="#/calendar"');
    expect(adminNav).not.toContain("getWorkflowScreens");
    expect(adminNav).not.toContain("apiDescription");
    expect(adminNav).toContain("menu-toggle");
    expect(adminNav).toContain("aria-expanded");
    expect(adminNav).toContain('canCollection(item.entity, "read")');
    expect(adminNav).toContain("ob-auth-changed");
    expect(adminNav).not.toContain("INTERNAL_PREFIXES");
    expect(adminNav).toContain('<ob-auth-menu placement="sidebar">');
    expect(adminNav).toContain("collapse-toggle");
    expect(adminNav).toContain("sidebarCollapseIcon");
    expect(adminNav).toContain('class="collapse-icon"');
    expect(adminNav).toContain("openb2c.admin.navCollapsed");
    expect(adminNav).toContain('this.toggleAttribute("collapsed", this._collapsed)');
    expect(adminNav).toContain("_syncCollapsedState");
    expect(authMenu).toContain("#/login");
    expect(authMenu).toContain("#/account");
    expect(authMenu).not.toContain("./ob-auth-panel");
    expect(authMenu).not.toContain('inputmode="email"');
    expect(authMenu).not.toContain("setCertificateAuth");
    expect(authPanel).toContain('inputmode="email"');
    expect(authPanel).toContain("setCertificateAuth");
    expect(authPanel).toContain("setSessionAuth");
    expect(authPanel).toContain("clearAuthContext({ revoke: true })");
    expect(authPanel).toContain('location.hash = "#/account"');
    expect(authPage).toContain("./ob-auth-panel");
    expect(authPage).toContain("./ob-account-summary");
    expect(authPage).toContain("<ob-auth-panel hide-header");
    expect(accountSummary).toContain("/api/users/${this._userId}");
    expect(accountSummary).toContain("user_id=${encodeURIComponent");
    expect(accountSummary).toContain('data-form="profile"');
    expect(entityList).toContain("listSchemaFields");
    expect(entityList).toContain("filterableSchemaFields");
    expect(entityList).toContain('data-filter-field');
    expect(entityList).toContain('data-action="page-size"');
    expect(entityList).toContain('data-action="clear-filters"');
    expect(entityList).toContain("const tableMinWidth = Math.max(760, (cols.length + 1) * 128)");
    expect(entityList).toContain('style="min-width: ${tableMinWidth}px"');
    expect(entityList).toContain("recordHref(api, this.entity, row.id)");
    expect(entityList).toContain("primaryRecordColumn(cols)");
    expect(entityList).toContain("listFieldDisplayLabel(c, prop, c === primaryColumn)");
    expect(entityList).toContain('class="record-link"');
    expect(entityList).toContain("recordHref(api, fks[column], value)");
    expect(entityList).toContain("lookupLabelFor(value, lookupRows, relationship)");
    expect(entityList).toContain("function lookupLabelFor");
    expect(entityList).toContain('api.canCollection(this.entity, "read")');
    expect(entityList).toContain('api.canCollection(this.entity, "create")');
    expect(entityForm).toContain('type="date"');
    expect(entityForm).toContain('type="time"');
    expect(entityForm).toContain('type="datetime-local"');
    expect(entityForm).toContain('step="0.01"');
    expect(entityForm).toContain("formValueFor");
    expect(entityForm).toContain("formDisplayValue");
    expect(entityForm).toContain("relationshipLabelFor");
    expect(entityForm).toContain('"defaults"');
    expect(entityForm).toContain('"return-to"');
    expect(entityForm).toContain("lockedFields");
    expect(entityForm).toContain("this.returnTo");
    expect(entityForm).toContain('api.can(this.entity, "update", record)');
    expect(entityForm).toContain('api.canCollection(this.entity, "create")');
    expect(entityDetail).toContain("getOperationWorkflow");
    expect(entityDetail).toContain("confirmation?.required");
    expect(entityDetail).toContain('data-action="confirm-operation"');
    expect(entityDetail).toContain('api.can(this.entity, "update", record)');
    expect(entityDetail).toContain('api.can(this.entity, "delete", record)');
    expect(entityDetail).toContain('api.can(this.entity, operation.op, record)');
    expect(entityDetail).toContain('!api.canCollection(entity, "read")');
    expect(entityDetail).toContain("_loadRelatedRecords");
    expect(entityDetail).toContain("getAllEntities");
    expect(entityDetail).toContain("related-section");
    expect(entityDetail).toContain("operationAvailability");
    expect(entityDetail).toContain("disabled");
    expect(entityDetail).toContain("relatedListHref");
    expect(adminWorkspace).toContain('customElements.define("ob-admin-workspace"');
    expect(adminWorkspace).toContain('"record-id"');
    expect(adminWorkspace).toContain("getAdminWorkspace");
    expect(adminWorkspace).toContain("getEntityGraph");
    expect(adminWorkspace).toContain("workspaceHref");
    expect(adminWorkspace).toContain("recordHref");
    expect(adminWorkspace).toContain("loadRecordContext");
    expect(adminWorkspace).toContain("inferMatrices");
    expect(adminWorkspace).toContain("inferMaterials");
    expect(adminWorkspace).toContain("inferPeople");
    expect(adminWorkspace).toContain("Coverage matrix");
    expect(adminWorkspace).toContain("<ob-entity-list");
    expect(adminCalendar).toContain('customElements.define("ob-admin-calendar"');
    expect(adminCalendar).toContain("getAdminTemporalEntities");
    expect(adminCalendar).toContain("temporalDescriptor");
    expect(adminCalendar).toContain("groupEventsByDay");
    expect(adminCalendar).toContain("more-events");
    expect(adminCalendar).toContain('data-action="entity-filter"');
    expect(workflowBoard).toContain('customElements.define("ob-workflow-board"');
    expect(workflowBoard).toContain("getWorkflowScreen");
    expect(workflowBoard).toContain("getWorkflowOperations");
    expect(workflowBoard).toContain("operationAvailability");
    expect(workflowBoard).toContain('data-action="confirm-operation"');
    expect(workflowBoard).toContain("api.can(screen.entity, action.op, row)");
    const obApi = await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text();
    expect(obApi).toContain("getOperationWorkflow");
    expect(obApi).toContain("getOperationPolicy");
    expect(obApi).toContain("getWorkflowScreens");
    expect(obApi).toContain("getWorkflowOperations");
    expect(obApi).toContain("getAllEntities");
    expect(obApi).toContain("isInternalEntity");
    expect(obApi).toContain("refreshAuthContext");
    expect(obApi).toContain("canCollection");
    expect(obApi).toContain("permissionReason");
    expect(obApi).toContain("getNavigationItems");
    expect(obApi).toContain("getNavigationGroups");
    expect(obApi).toContain("getEntityGraph");
    expect(obApi).toContain("getAdminWorkspaces");
    expect(obApi).toContain("getAdminWorkspaceGroups");
    expect(obApi).toContain("getAdminTemporalEntities");
    expect(obApi).toContain("temporalFieldsHaveCalendarAnchor");
    expect(obApi).toContain("restoreAuthContext");
    expect(obApi).toContain("setBearerAuth");
    expect(obApi).toContain("setApiKeyAuth");
    expect(obApi).toContain("setSessionAuth");
    expect(obApi).toContain("bearerToken");
    expect(obApi).toContain("indexedDB.open");
    expect(obApi).toContain('exportKey("jwk"');
    expect(obApi).toContain('exportKey("pkcs8"');
    expect(obApi).toContain('importKey("jwk"');
    expect(obApi).toContain('importKey("pkcs8"');
    expect(obApi).toContain("localStorage.setItem");
    expect(obApi).toContain('request("/auth/revoke-current"');
    expect(obApi).toContain("_resolveApiBase");
    expect(obApi).toContain("OPENB2C_API_BASE");
    expect(obApi).toContain('meta[name="openb2c-api-base"]');
    expect(obApi).toContain("isLocalHost(location.hostname)");
    expect(authMenu).toContain('observedAttributes');
    expect(authMenu).toContain('placement');
    expect(authMenu).toContain("../style-link");
    expect(authMenu).not.toContain("../styles");
    expect(publicRoute).toContain("./ob-commerce");
    expect(publicRoute).toContain("./ob-auth-page");
    expect(publicRoute).toContain("../route");
    expect(publicRoute).not.toContain("./ob-entity");
    expect(adminRoute).toContain("./ob-auth-page");
    expect(adminRoute).toContain("../route");
    expect(adminRoute).toContain("getNavigationItems");
    expect(adminRoute).toContain("getAdminWorkspaces");
    expect(adminRoute).not.toContain("INTERNAL_PREFIXES");
    expect(adminRoute).toContain('page.setAttribute("context", "admin")');
    expect(adminRoute).toContain("const filter = params.toString()");
    expect(adminRoute).toContain("./ob-admin-workspace");
    expect(adminRoute).toContain("./ob-admin-calendar");
    expect(adminRoute).toContain('hash === "/calendar"');
    expect(adminRoute).toContain('workspace.setAttribute("record-id"');
    expect(adminRoute).toContain("formRouteAttrs");
    expect(adminRoute).toContain("./ob-workflow-board");
    expect(adminRoute).toContain("./ob-entity-list");
    expect(adminRoute).toContain("./ob-entity-form");
    expect(adminRoute).toContain("./ob-entity-detail");
    expect(adminRoute).not.toContain("./ob-commerce");
  });

  test("OpenAPI exposes ontology-derived navigation metadata", () => {
    const openapi = JSON.parse(genOpenAPI(navigationSchema()));

    expect(openapi["x-openb2c-navigation"].groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "data", label: "Data" }),
      expect.objectContaining({ id: "workflow", label: "Workflow" }),
      expect.objectContaining({ id: "payment", label: "Payment" }),
      expect.objectContaining({ id: "security", label: "Security", internal: true }),
    ]));
    expect(openapi["x-openb2c-navigation"].items).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: "user", path: "#/users", label: "Users", group: "data", internal: false }),
      expect.objectContaining({ entity: "issue", path: "#/issues", label: "Issues", group: "workflow", displayPriority: 15, internal: false }),
      expect.objectContaining({ entity: "payment", path: "#/payments", label: "Payments", group: "payment", internal: false }),
      expect.objectContaining({ entity: "api_key", path: "#/api_keys", label: "API Keys", group: "security", internal: true }),
      expect.objectContaining({ entity: "identity_challenge", path: "#/identity_challenges", label: "Identity Challenges", group: "security", internal: true }),
    ]));
    expect(openapi["x-openb2c-navigation"].items.some((item: any) => item.entity === "issue_label")).toBe(false);
  });

  test("auth panel implements the generated identity challenge login flow", async () => {
    const authPanel = await Bun.file(join(UI_DIR, "components", "ob-auth-panel.ts")).text();
    const obApi = await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text();

    expect(authPanel).toContain("ObApi.createIdentityKeypair()");
    expect(authPanel).toContain('request("/identity/challenge"');
    expect(authPanel).toContain("publicKey: keypair.publicKey");
    expect(authPanel).toContain("this._challengeId = data.challengeId");
    expect(authPanel).toContain("Development code:");
    expect(authPanel).toContain('autocomplete="one-time-code"');
    expect(authPanel).toContain("ObApi.signWithIdentityKey(this._privateKey, code)");
    expect(authPanel).toContain('request("/identity/verify"');
    expect(authPanel).toContain("setSessionAuth(data.auth, data.sessionToken, data.sessionExpiresAt)");
    expect(authPanel).toContain("setCertificateAuth(data.certificate, this._privateKey)");
    expect(authPanel).toContain('data-action="logout"');

    expect(obApi).toContain('headers.set("Authorization", `Bearer ${this._bearerToken}`)');
    expect(obApi).toContain('const res = await this.request("/auth/context");');
    expect(obApi).toContain("return this.setBearerAuth(apiKey");
    expect(obApi).toContain('headers.set("X-Certificate", JSON.stringify(this._certificate))');
    expect(obApi).toContain('headers.set("X-Signature"');
    expect(obApi).toContain("restoreAuthContext");
  });

  test("public commerce actions keep the primary path visually last", async () => {
    const publicApp = await Bun.file(join(UI_DIR, "components", "ob-app.ts")).text();
    const commerceComponent = await Bun.file(join(UI_DIR, "components", "ob-commerce.ts")).text();
    const publicStyles = genPublicStylesheet();

    const accountIndex = publicApp.indexOf("<ob-auth-menu></ob-auth-menu>");
    const checkoutIndex = publicApp.indexOf('<button class="nav-button" type="button" data-action="checkout" hidden>Book tickets</button>');
    expect(accountIndex).toBeGreaterThan(-1);
    expect(checkoutIndex).toBeGreaterThan(accountIndex);

    const changeDetailsIndex = commerceComponent.indexOf('data-action="back-to-variants"');
    const addToCartIndex = commerceComponent.indexOf('type="submit" class="primary">Add to cart</button>');
    const changeDetailsButtonCount = commerceComponent.match(/<button type="button" data-action="back-to-variants">Change details<\/button>/g)?.length ?? 0;
    expect(commerceComponent).toContain('class="actions split-actions"');
    expect(changeDetailsIndex).toBeGreaterThan(-1);
    expect(changeDetailsButtonCount).toBe(1);
    expect(addToCartIndex).toBeGreaterThan(changeDetailsIndex);
    expect(publicStyles).toContain(":host(ob-commerce) .split-actions{align-items:center;justify-content:flex-end}");
  });

  test("admin navigation collapses by default on mobile", () => {
    const adminStyles = genAdminStylesheet();

    expect(adminStyles).toContain(":host(ob-nav) .menu-toggle{display:none");
    expect(adminStyles).toContain("ob-admin-app ob-nav{flex:0 0 var(--ob-nav-width);min-width:0;transition:flex-basis 0.18s ease}");
    expect(adminStyles).toContain(":host(ob-nav){position:sticky;top:0;height:100vh;z-index:2;min-width:0;overflow:hidden}");
    expect(adminStyles).toContain(":host(ob-nav) .brand{display:flex;align-items:center;justify-content:space-between;gap:10px;height:52px");
    expect(adminStyles).toContain(":host(ob-nav) .title{font-weight:800;font-size:17px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}");
    expect(adminStyles).toContain(":host(ob-nav) .collapse-toggle{display:inline-grid");
    expect(adminStyles).toContain(":host(ob-nav) .collapse-icon{width:18px;height:18px;fill:none;stroke:currentColor");
    expect(adminStyles).toContain("ob-admin-app ob-nav[collapsed]{flex-basis:var(--ob-nav-collapsed-width)}");
    expect(adminStyles).toContain(":host(ob-nav[collapsed]) nav{width:var(--ob-nav-collapsed-width)");
    expect(adminStyles).toContain(":host(ob-nav) .nav-groups,:host(ob-nav) .account{display:none}");
    expect(adminStyles).toContain(":host(ob-nav) nav.expanded .nav-groups,:host(ob-nav) nav.expanded .account{display:grid}");
    expect(adminStyles).toContain(":host(ob-nav) .nav-link{display:flex;align-items:center;justify-content:flex-start");
    expect(adminStyles).toContain(":host(ob-nav) .nav-groups{display:grid;gap:18px}");
    expect(adminStyles).toContain(":host(ob-admin-workspace) .record-panels{display:grid;gap:16px}");
    expect(adminStyles).toContain(":host(ob-admin-calendar) .calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(110px,1fr))");
    expect(adminStyles).toContain(":host(ob-admin-calendar) .event-row{display:grid;grid-template-columns:150px 96px minmax(0,1fr) 140px");
    expect(adminStyles).toContain(":host(ob-admin-calendar) .more-events{padding:2px 7px;font-weight:800}");
    expect(adminStyles).toContain(":host(ob-admin-workspace) .matrix-wrap{max-width:100%;overflow-x:auto}");
    expect(adminStyles).toContain(":host(ob-admin-workspace) ob-entity-list{display:block;min-width:0;max-width:100%}");
    expect(adminStyles).toContain(":host(ob-entity-list){display:block;min-width:0;max-width:100%}");
    expect(adminStyles).toContain("html{min-height:100%;max-width:100%;overflow-x:hidden");
    expect(adminStyles).toContain("ob-admin-app ob-admin-route-outlet{flex:1;min-width:0;width:100%;max-width:1280px;overflow-x:hidden");
    expect(adminStyles).toContain(".table-wrap{overflow:auto;width:100%;max-width:100%;min-width:0;contain:layout paint inline-size");
    expect(adminStyles).toContain(":host(ob-entity-form) .form-group input[readonly]");
    expect(adminStyles).toContain(".entity-table{table-layout:fixed}");
    expect(adminStyles).toContain(".entity-table th,.entity-table td{max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}");
    expect(adminStyles).toContain(".entity-table .cell-link,.entity-table .record-link{color:var(--ob-primary);font-weight:700;text-decoration:underline");
  });

  test("public and admin bundles only include their required components", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "openb2c-ui-"));
    const publicOut = join(tmp, "public");
    const adminOut = join(tmp, "admin");

    try {
      await mkdir(publicOut, { recursive: true });
      await mkdir(adminOut, { recursive: true });
      await writeFile(join(publicOut, "styles.css"), genPublicStylesheet());
      await writeFile(join(adminOut, "styles.css"), genAdminStylesheet());
      const publicResult = await Bun.build({
        entrypoints: [join(UI_DIR, "public.ts")],
        outdir: publicOut,
        naming: {
          entry: "app.js",
          chunk: "chunks/[name]-[hash].js",
        },
        splitting: true,
        format: "esm",
        minify: true,
      });
      const adminResult = await Bun.build({
        entrypoints: [join(UI_DIR, "admin.ts")],
        outdir: adminOut,
        naming: {
          entry: "app.js",
          chunk: "chunks/[name]-[hash].js",
        },
        splitting: true,
        format: "esm",
        minify: true,
      });

      expect(publicResult.success).toBe(true);
      expect(adminResult.success).toBe(true);

      const publicFiles = await assetFiles(publicOut);
      const adminFiles = await assetFiles(adminOut);
      const publicBundle = await readFiles(publicFiles.filter((file) => file.endsWith(".js")));
      const adminBundle = await readFiles(adminFiles.filter((file) => file.endsWith(".js")));
      const publicEntryBytes = await Bun.file(join(publicOut, "app.js")).arrayBuffer();
      const adminEntryBytes = await Bun.file(join(adminOut, "app.js")).arrayBuffer();

      expect(publicBundle).toContain("ob-commerce");
      expect(publicBundle).toContain("ob-auth-menu");
      expect(publicBundle).toContain("ob-auth-page");
      expect(publicBundle).toContain("ob-auth-panel");
      expect(publicBundle).toContain("ob-account-summary");
      expect(publicBundle).not.toContain("ob-admin-app");
      expect(publicBundle).not.toContain("ob-entity-list");
      expect(publicBundle).not.toContain("ob-entity-form");
      expect(publicBundle).not.toContain("ob-entity-detail");
      expect(publicBundle).not.toContain("ob-admin-calendar");
      expect(publicBundle).not.toContain("ob-workflow-board");

      expect(adminBundle).toContain("ob-admin-app");
      expect(adminBundle).toContain("ob-admin-calendar");
      expect(adminBundle).toContain("ob-admin-workspace");
      expect(adminBundle).toContain("ob-entity-list");
      expect(adminBundle).toContain("ob-entity-form");
      expect(adminBundle).toContain("ob-entity-detail");
      expect(adminBundle).toContain("ob-workflow-board");
      expect(adminBundle).toContain("ob-auth-menu");
      expect(adminBundle).toContain("ob-auth-page");
      expect(adminBundle).toContain("ob-auth-panel");
      expect(adminBundle).toContain("ob-account-summary");
      expect(adminBundle).not.toContain("ob-commerce");
      expect(publicEntryBytes.byteLength).toBeLessThanOrEqual(14 * 1024);
      expect(adminEntryBytes.byteLength).toBeLessThanOrEqual(14 * 1024);
      await expect(gzipSize(await initialAssetFiles(publicOut))).resolves.toBeLessThanOrEqual(14 * 1024);
      await expect(gzipSize(await initialAssetFiles(adminOut))).resolves.toBeLessThanOrEqual(14 * 1024);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

async function assetFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return assetFiles(path);
    if (entry.name.endsWith(".js") || entry.name.endsWith(".css")) return [path];
    return [];
  }));
  return files.flat().sort();
}

async function readFiles(files: string[]): Promise<string> {
  const contents = await Promise.all(files.map((file) => Bun.file(file).text()));
  return contents.join("\n");
}

async function initialAssetFiles(dir: string): Promise<string[]> {
  const seen = new Set<string>([join(dir, "styles.css")]);

  async function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await Bun.file(file).text();
    for (const specifier of staticImports(source)) {
      if (!specifier.startsWith(".")) continue;
      const imported = normalize(join(dirname(file), specifier));
      if (imported.startsWith(dir) && imported.endsWith(".js")) {
        await visit(imported);
      }
    }
  }

  await visit(join(dir, "app.js"));
  return [...seen].sort();
}

function staticImports(source: string): string[] {
  return [...source.matchAll(/import(?:\s+[^("'`]+?\s+from)?\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

async function gzipSize(files: string[]): Promise<number> {
  const buffers = await Promise.all(files.map(async (file) => Buffer.from(await Bun.file(file).arrayBuffer())));
  return buffers.reduce((total, buffer) => total + gzipSync(buffer, { level: 9 }).byteLength, 0);
}
