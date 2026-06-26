/**
 * <ob-api src="openapi.json"> — Fetches and caches the OpenAPI spec, provides context to children.
 */
export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, any>; securitySchemes?: Record<string, any> };
  "x-openb2c-organization"?: {
    name?: string;
    description?: string;
    logo?: { src: string; alt: string | null } | null;
  };
  "x-openb2c-ecommerce"?: any;
  "x-openb2c-navigation"?: {
    groups?: NavigationGroup[];
    items?: NavigationItem[];
  };
  "x-openb2c-workflows"?: {
    groups?: Record<string, WorkflowGroup>;
    operationWorkflows?: Record<string, Record<string, any>>;
  };
}

export interface NavigationGroup {
  id: string;
  label: string;
  displayPriority?: number;
  internal?: boolean;
}

export interface NavigationItem {
  entity: string;
  path: string;
  label: string;
  group?: string;
  displayPriority?: number;
  internal?: boolean;
}

export interface EntityGraphEdge {
  sourceEntity: string;
  sourceField: string;
  targetEntity: string;
  targetField: string;
  label: string;
  cardinality: string;
}

export interface EntityGraphNode {
  entity: string;
  inbound: EntityGraphEdge[];
  outbound: EntityGraphEdge[];
  temporalFields: string[];
  workflowScreens: WorkflowScreen[];
  isInternal: boolean;
  isCommerce: boolean;
  isWorkflow: boolean;
  isSupport: boolean;
  degree: number;
}

export interface EntityGraph {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
}

export interface AdminWorkspace extends NavigationItem {
  inbound: EntityGraphEdge[];
  outbound: EntityGraphEdge[];
  related: EntityGraphEdge[];
  temporalFields: string[];
  workflowScreens: WorkflowScreen[];
  supportEntities: string[];
}

export interface AdminTemporalEntity extends NavigationItem {
  temporalFields: string[];
}

export interface WorkflowGroup {
  label?: string;
  description?: string;
  displayPriority?: number;
}

export interface WorkflowScreen {
  id: string;
  label: string;
  description: string;
  displayPriority?: number;
  entity: string;
  statusField: string;
  path: string;
}

export interface Certificate {
  email: string;
  publicKey: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export type PermissionScope = string;

export interface AuthContext {
  userId: number | null;
  scopes: PermissionScope[];
}

type StoredIdentitySession = {
  id: string;
  auth?: AuthContext;
  bearerToken?: string;
  certificate?: Certificate;
  expiresAt?: string;
  privateKeyJwk?: JsonWebKey;
  privateKeyPkcs8?: string;
  privateKey?: CryptoKey;
  savedAt: string;
};

export const ANONYMOUS_AUTH_CONTEXT: AuthContext = {
  userId: null,
  scopes: [],
};

export const SYSTEM_AUTH_CONTEXT: AuthContext = {
  userId: null,
  scopes: ["*"],
};

declare global {
  interface Window {
    OPENB2C_API_BASE?: string;
  }
}

let _instance: ObApi | null = null;
const AUTH_DB_NAME = "openb2c-auth";
const AUTH_DB_VERSION = 1;
const AUTH_STORE_NAME = "identity_sessions";

export class ObApi extends HTMLElement {
  spec: OpenAPISpec | null = null;
  authContext: AuthContext = ANONYMOUS_AUTH_CONTEXT;
  /** Base URL for API calls (e.g., "http://localhost:<port>"). Empty string means same origin. */
  apiBase = "";
  private _bearerToken = "";
  private _certificate: Certificate | null = null;
  private _privateKey: CryptoKey | null = null;
  private _ready: Promise<void>;
  private _resolve!: () => void;

  constructor() {
    super();
    this._ready = new Promise((r) => (this._resolve = r));
    _instance = this;
  }

  static get instance(): ObApi | null {
    return _instance;
  }

  async connectedCallback() {
    const src = this.getAttribute("src") || "openapi.json";
    const res = await fetch(src);
    this.spec = await res.json();
    this.apiBase = this._resolveApiBase();
    await this.restoreAuthContext();
    if (this.authContext.userId === null && !this.hasScope("*")) {
      await this.refreshAuthContext({ silent: true });
    }
    this._resolve();
    this.dispatchEvent(new CustomEvent("ob-spec-ready", { bubbles: true }));
  }

  /** Build a full API URL from a path like /api/issues */
  url(path: string): string {
    return this.apiBase + path;
  }

  private _resolveApiBase(): string {
    const explicit = this.getAttribute("api-base");
    if (explicit !== null) return explicit.replace(/\/$/, "");

    const meta = document.querySelector<HTMLMetaElement>('meta[name="openb2c-api-base"]')?.content;
    if (meta) return meta.replace(/\/$/, "");

    if (window.OPENB2C_API_BASE) return window.OPENB2C_API_BASE.replace(/\/$/, "");

    const serverUrl = this.spec?.servers?.[0]?.url;
    if (serverUrl && isLocalHost(location.hostname)) {
      try {
        const url = new URL(serverUrl, location.href);
        if (isLocalHost(url.hostname)) return url.origin;
      } catch {
        return "";
      }
    }
    return "";
  }

  setAuthContext(auth: AuthContext, bearerToken = "") {
    this.authContext = auth;
    this._bearerToken = bearerToken;
    this._certificate = null;
    this._privateKey = null;
    this.dispatchEvent(new CustomEvent("ob-auth-changed", { bubbles: true, detail: auth }));
  }

  async setBearerAuth(bearerToken: string, options: { persist?: boolean } = {}): Promise<AuthContext> {
    const token = bearerToken.trim();
    if (!token) throw new Error("Bearer token is required");

    this._bearerToken = token;
    this._certificate = null;
    this._privateKey = null;

    const res = await this.request("/auth/context");
    if (!res.ok) {
      this._bearerToken = "";
      const error = await res.json().catch(() => ({ error: "sign in failed" }));
      throw new Error(error.error || "sign in failed");
    }

    const auth = await res.json() as AuthContext;
    this.setAuthContext(auth, token);
    if (options.persist === true) {
      await this._saveStoredBearerSession(auth, token);
    }
    return auth;
  }

  async setApiKeyAuth(apiKey: string, options: { persist?: boolean } = {}): Promise<AuthContext> {
    return this.setBearerAuth(apiKey, { persist: options.persist === true });
  }

  async setSessionAuth(auth: AuthContext, bearerToken: string, expiresAt?: string, options: { persist?: boolean } = {}): Promise<AuthContext> {
    this.setAuthContext(auth, bearerToken);
    if (options.persist !== false) {
      await this._saveStoredBearerSession(auth, bearerToken, expiresAt);
    }
    return auth;
  }

  async setCertificateAuth(certificate: Certificate, privateKey: CryptoKey, options: { persist?: boolean } = {}): Promise<AuthContext> {
    this._certificate = certificate;
    this._privateKey = privateKey;
    this._bearerToken = "";

    const res = await this.request("/auth/context");
    if (!res.ok) {
      this._certificate = null;
      this._privateKey = null;
      const error = await res.json().catch(() => ({ error: "sign in failed" }));
      throw new Error(error.error || "sign in failed");
    }

    const auth = await res.json() as AuthContext;
    this.authContext = auth;
    if (options.persist !== false) {
      await this._saveStoredIdentitySession(certificate, privateKey);
    }
    this.dispatchEvent(new CustomEvent("ob-auth-changed", { bubbles: true, detail: auth }));
    return auth;
  }

  async clearAuthContext(options: { revoke?: boolean } = {}) {
    if (options.revoke && (this._bearerToken || (this._certificate && this._privateKey))) {
      await this.request("/auth/revoke-current", { method: "POST" }).catch(() => null);
    }
    this._certificate = null;
    this._privateKey = null;
    await this._deleteStoredIdentitySession();
    this.setAuthContext(ANONYMOUS_AUTH_CONTEXT);
  }

  async refreshAuthContext(options: { silent?: boolean } = {}): Promise<AuthContext | null> {
    if (!this.hasIdentityAuth()) return this.authContext;
    const res = await this.request("/auth/context");
    if (!res.ok) {
      if (options.silent) return null;
      const error = await res.json().catch(() => ({ error: "authentication required" }));
      throw new Error(error.error || "authentication required");
    }
    const auth = await res.json() as AuthContext;
    this.authContext = auth;
    this.dispatchEvent(new CustomEvent("ob-auth-changed", { bubbles: true, detail: auth }));
    return auth;
  }

  async restoreAuthContext(): Promise<AuthContext> {
    if (!this.hasIdentityAuth()) return this.authContext;
    const stored = await this._loadStoredIdentitySession();
    if (!stored) return this.authContext;
    if (stored.bearerToken && stored.auth) {
      if (stored.expiresAt && Date.parse(stored.expiresAt) <= Date.now()) {
        await this._deleteStoredIdentitySession();
        return this.authContext;
      }
      this._bearerToken = stored.bearerToken;
      try {
        const res = await this.request("/auth/context");
        if (!res.ok) throw new Error("stored session expired");
        const auth = await res.json() as AuthContext;
        this.setAuthContext(auth, stored.bearerToken);
        return auth;
      } catch {
        await this._deleteStoredIdentitySession();
        this.setAuthContext(ANONYMOUS_AUTH_CONTEXT);
        return this.authContext;
      }
    }
    if (!stored.certificate) {
      await this._deleteStoredIdentitySession();
      return this.authContext;
    }
    if (Date.parse(stored.certificate.expiresAt) <= Date.now()) {
      await this._deleteStoredIdentitySession();
      return this.authContext;
    }
    const privateKey = await this._importStoredPrivateKey(stored);
    if (!privateKey) {
      await this._deleteStoredIdentitySession();
      return this.authContext;
    }
    try {
      return await this.setCertificateAuth(stored.certificate, privateKey, { persist: false });
    } catch {
      await this._deleteStoredIdentitySession();
      this.setAuthContext(ANONYMOUS_AUTH_CONTEXT);
      return this.authContext;
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this._bearerToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this._bearerToken}`);
    }
    if (this._certificate && this._privateKey && !headers.has("X-Certificate")) {
      const method = (init.method || "GET").toUpperCase();
      const timestamp = String(Date.now());
      const signedPath = new URL(path, "http://openb2c.local").pathname;
      headers.set("X-Certificate", JSON.stringify(this._certificate));
      headers.set("X-Timestamp", timestamp);
      headers.set("X-Signature", await ObApi.signWithIdentityKey(this._privateKey, `${method} ${signedPath} ${timestamp}`));
    }
    return fetch(this.url(path), { ...init, headers });
  }

  static async createIdentityKeypair(): Promise<{ publicKey: string; privateKey: CryptoKey }> {
    const keypair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const publicKey = await crypto.subtle.exportKey("raw", keypair.publicKey);
    return { publicKey: bytesToHex(new Uint8Array(publicKey)), privateKey: keypair.privateKey };
  }

  static async signWithIdentityKey(privateKey: CryptoKey, message: string): Promise<string> {
    const signature = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(message));
    return bytesToHex(new Uint8Array(signature));
  }

  private _identityStorageKey(): string {
    return `${location.origin}|${this.apiBase || "same-origin"}`;
  }

  private async _openIdentityDb(): Promise<IDBDatabase | null> {
    if (!("indexedDB" in globalThis)) return null;
    return new Promise((resolve) => {
      const req = indexedDB.open(AUTH_DB_NAME, AUTH_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AUTH_STORE_NAME)) {
          db.createObjectStore(AUTH_STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }

  private async _loadStoredIdentitySession(): Promise<StoredIdentitySession | null> {
    const db = await this._openIdentityDb();
    if (!db) return this._loadLocalIdentitySession();
    const stored = await new Promise<StoredIdentitySession | null>((resolve) => {
      const tx = db.transaction(AUTH_STORE_NAME, "readonly");
      const req = tx.objectStore(AUTH_STORE_NAME).get(this._identityStorageKey());
      req.onsuccess = () => resolve((req.result as StoredIdentitySession | undefined) || null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
    });
    return stored || this._loadLocalIdentitySession();
  }

  private async _saveStoredIdentitySession(certificate: Certificate, privateKey: CryptoKey): Promise<void> {
    try {
      const exportedKey = await this._exportStoredPrivateKey(privateKey);
      if (!exportedKey) return;
      const record: StoredIdentitySession = {
        id: this._identityStorageKey(),
        certificate,
        ...exportedKey,
        savedAt: new Date().toISOString(),
      };
      const db = await this._openIdentityDb();
      if (!db) {
        this._saveLocalIdentitySession(record);
        return;
      }
      const saved = await new Promise<boolean>((resolve) => {
        const tx = db.transaction(AUTH_STORE_NAME, "readwrite");
        tx.objectStore(AUTH_STORE_NAME).put(record);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      });
      if (!saved) this._saveLocalIdentitySession(record);
    } catch {
      // Persistence is opportunistic; the in-memory session remains valid.
    }
  }

  private async _saveStoredBearerSession(auth: AuthContext, bearerToken: string, expiresAt?: string): Promise<void> {
    const record: StoredIdentitySession = {
      id: this._identityStorageKey(),
      auth,
      bearerToken,
      expiresAt,
      savedAt: new Date().toISOString(),
    };
    const db = await this._openIdentityDb();
    if (!db) {
      this._saveLocalIdentitySession(record);
      return;
    }
    const saved = await new Promise<boolean>((resolve) => {
      const tx = db.transaction(AUTH_STORE_NAME, "readwrite");
      tx.objectStore(AUTH_STORE_NAME).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
    if (!saved) this._saveLocalIdentitySession(record);
  }

  private async _importStoredPrivateKey(stored: StoredIdentitySession): Promise<CryptoKey | null> {
    if (stored.privateKey) return stored.privateKey;
    if (stored.privateKeyJwk) {
      try {
        return await crypto.subtle.importKey("jwk", stored.privateKeyJwk, { name: "Ed25519" }, true, ["sign"]);
      } catch {
        // Fall through to PKCS#8 if the browser can import that form.
      }
    }
    if (stored.privateKeyPkcs8) {
      try {
        return await crypto.subtle.importKey("pkcs8", base64ToBytes(stored.privateKeyPkcs8), { name: "Ed25519" }, true, ["sign"]);
      } catch {
        return null;
      }
    }
    return null;
  }

  private async _deleteStoredIdentitySession(): Promise<void> {
    localStorage.removeItem(this._localStorageIdentityKey());
    const db = await this._openIdentityDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(AUTH_STORE_NAME, "readwrite");
      tx.objectStore(AUTH_STORE_NAME).delete(this._identityStorageKey());
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  }

  private async _exportStoredPrivateKey(privateKey: CryptoKey): Promise<Pick<StoredIdentitySession, "privateKeyJwk" | "privateKeyPkcs8"> | null> {
    const exported: Pick<StoredIdentitySession, "privateKeyJwk" | "privateKeyPkcs8"> = {};
    try {
      exported.privateKeyJwk = await crypto.subtle.exportKey("jwk", privateKey);
    } catch {
      // Fall back to PKCS#8 below.
    }
    try {
      const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
      exported.privateKeyPkcs8 = bytesToBase64(new Uint8Array(pkcs8));
    } catch {
      // Some browsers only support JWK for this key type.
    }
    return exported.privateKeyJwk || exported.privateKeyPkcs8 ? exported : null;
  }

  private _localStorageIdentityKey(): string {
    return `openb2c.identity.${this._identityStorageKey()}`;
  }

  private _loadLocalIdentitySession(): StoredIdentitySession | null {
    try {
      const raw = localStorage.getItem(this._localStorageIdentityKey());
      return raw ? JSON.parse(raw) as StoredIdentitySession : null;
    } catch {
      return null;
    }
  }

  private _saveLocalIdentitySession(record: StoredIdentitySession): void {
    try {
      localStorage.setItem(this._localStorageIdentityKey(), JSON.stringify(record));
    } catch {
      // Persistence is opportunistic.
    }
  }

  ready(): Promise<void> {
    return this._ready;
  }

  getSchema(entity: string): any | null {
    if (!this.spec) return null;
    const name = pascalCase(entity);
    return this.spec.components.schemas[name] || null;
  }

  getInputSchema(entity: string): any | null {
    if (!this.spec) return null;
    const name = pascalCase(entity) + "Input";
    return this.spec.components.schemas[name] || null;
  }

  /** Get entity names from API paths (e.g., /api/issues → issue), filtering join tables */
  getEntities(): string[] {
    const all = new Set(this.getAllEntities());
    // Filter out join tables: names like "issue_label" where both "issue" and "label" are entities
    const entities = [...all].filter((name) => {
      const parts = name.split("_");
      if (parts.length < 2) return true;
      // Check all ways to split "a_b_c" into two entity names
      for (let i = 1; i < parts.length; i++) {
        const left = parts.slice(0, i).join("_");
        const right = parts.slice(i).join("_");
        if (all.has(left) && all.has(right)) return false;
      }
      return true;
    });
    return entities;
  }

  /** Get every API-backed entity from collection paths, including relationship/link tables. */
  getAllEntities(): string[] {
    if (!this.spec) return [];
    const all = new Set<string>();
    for (const path of Object.keys(this.spec.paths)) {
      const m = path.match(/^\/api\/([a-z_]+)s$/);
      if (m) all.add(m[1]);
    }
    return [...all];
  }

  isInternalEntity(entity: string): boolean {
    const item = this.spec?.["x-openb2c-navigation"]?.items?.find((candidate) => candidate.entity === entity);
    return item?.internal ?? (entity.startsWith("identity_") || entity === "api_key" || entity.startsWith("openb2c_"));
  }

  getNavigationGroups(options: { includeInternal?: boolean } = {}): NavigationGroup[] {
    const items = this.getNavigationItems(options);
    const usedGroups = new Set(items.map((item) => item.group || "data"));
    const configured = this.spec?.["x-openb2c-navigation"]?.groups || [];
    const groups = configured.length > 0 ? configured : [{ id: "data", label: "Data", displayPriority: 100 }];
    const byId = new Map(groups.map((group) => [group.id, group]));

    for (const groupId of usedGroups) {
      if (!byId.has(groupId)) byId.set(groupId, { id: groupId, label: titleCase(groupId), displayPriority: 1000 });
    }

    return [...byId.values()]
      .filter((group) => usedGroups.has(group.id))
      .filter((group) => options.includeInternal || !group.internal)
      .sort(sortNavigationGroups);
  }

  getNavigationItems(options: { includeInternal?: boolean } = {}): NavigationItem[] {
    const items = this.spec?.["x-openb2c-navigation"]?.items || [];
    if (items.length > 0) {
      return [...items]
        .filter((item) => options.includeInternal || !item.internal)
        .sort((a, b) => {
          const groupDelta = this._navigationGroupPriority(a.group) - this._navigationGroupPriority(b.group);
          if (groupDelta !== 0) return groupDelta;
          return sortNavigationItems(a, b);
        });
    }

    return this.getEntities().map((entity, index) => ({
      entity,
      path: `#/${entity}s`,
      label: pluralLabel(titleCase(entity)),
      group: "data",
      displayPriority: index * 10,
      internal: false,
    }));
  }

  getEntityGraph(options: { includeInternal?: boolean } = {}): EntityGraph {
    const allEntities = new Set(this.getAllEntities());
    const entities = [...allEntities]
      .filter((entity) => options.includeInternal || !this.isInternalEntity(entity));
    const visibleEntities = new Set(entities);
    const workflowScreens = this.getWorkflowScreens();
    const edges: EntityGraphEdge[] = [];

    for (const entity of entities) {
      const relationships = this.getForeignKeyRelationships(entity);
      const fks = this.getForeignKeys(entity);
      for (const [field, targetEntity] of Object.entries(fks)) {
        if (!allEntities.has(targetEntity) || !visibleEntities.has(targetEntity)) continue;
        const relationship = relationships[field] || {};
        edges.push({
          sourceEntity: entity,
          sourceField: field,
          targetEntity,
          targetField: relationship.targetField || "id",
          label: relationship.label || titleCase(field.replace(/_id$/, "")),
          cardinality: relationship.cardinality || "one",
        });
      }
    }

    const nodes = entities.map((entity) => {
      const inbound = edges.filter((edge) => edge.targetEntity === entity);
      const outbound = edges.filter((edge) => edge.sourceEntity === entity);
      const entityWorkflowScreens = workflowScreens.filter((screen) => screen.entity === entity);
      const isWorkflow = entityWorkflowScreens.length > 0 || this.getOperations(entity).some((operation) => Boolean(this.getOperationWorkflow(entity, operation)));
      const isCommerce = this._isCommerceEntity(entity);
      const isInternal = this.isInternalEntity(entity);
      const temporalFields = temporalSchemaFields(this.getSchema(entity));
      return {
        entity,
        inbound,
        outbound,
        temporalFields,
        workflowScreens: entityWorkflowScreens,
        isInternal,
        isCommerce,
        isWorkflow,
        isSupport: isSupportEntity(entity, this.getSchema(entity), outbound, { isInternal, isCommerce, isWorkflow }),
        degree: inbound.length + outbound.length,
      };
    });

    return { nodes, edges };
  }

  getAdminWorkspaces(options: { includeInternal?: boolean } = {}): AdminWorkspace[] {
    const graph = this.getEntityGraph(options);
    const navigationItems = new Map(this.getNavigationItems({ includeInternal: true }).map((item) => [item.entity, item]));
    return graph.nodes
      .filter((node) => this._isAdminWorkspaceNode(node))
      .map((node, index) => {
        const item = navigationItems.get(node.entity);
        const group = workspaceGroup(node, item?.group);
        const workspace: AdminWorkspace = {
          entity: node.entity,
          path: `#/workspaces/${node.entity}`,
          label: item?.label || pluralLabel(titleCase(node.entity)),
          group,
          displayPriority: item?.displayPriority ?? workspacePriority(node, index),
          internal: node.isInternal,
          inbound: node.inbound,
          outbound: node.outbound,
          related: [...node.inbound, ...node.outbound],
          temporalFields: node.temporalFields,
          workflowScreens: node.workflowScreens,
          supportEntities: supportEntitiesFor(node, graph),
        };
        return workspace;
      })
      .filter((workspace) => options.includeInternal || !workspace.internal)
      .sort((a, b) => {
        const groupDelta = this._navigationGroupPriority(a.group) - this._navigationGroupPriority(b.group);
        if (groupDelta !== 0) return groupDelta;
        return sortNavigationItems(a, b);
      });
  }

  getAdminWorkspace(entity: string, options: { includeInternal?: boolean } = {}): AdminWorkspace | null {
    return this.getAdminWorkspaces(options).find((workspace) => workspace.entity === entity) || null;
  }

  getAdminTemporalEntities(options: { includeInternal?: boolean } = {}): AdminTemporalEntity[] {
    const graph = this.getEntityGraph(options);
    const navigationItems = new Map(this.getNavigationItems({ includeInternal: true }).map((item) => [item.entity, item]));
    return graph.nodes
      .filter((node) => node.temporalFields.length > 0)
      .filter((node) => options.includeInternal || !node.isInternal)
      .filter((node) => temporalFieldsHaveCalendarAnchor(this.getSchema(node.entity), node.temporalFields))
      .map((node, index) => {
        const item = navigationItems.get(node.entity);
        return {
          entity: node.entity,
          path: `#/${node.entity}s`,
          label: item?.label || pluralLabel(titleCase(node.entity)),
          group: item?.group || workspaceGroup(node),
          displayPriority: item?.displayPriority ?? workspacePriority(node, index),
          internal: node.isInternal,
          temporalFields: node.temporalFields,
        };
      })
      .sort((a, b) => {
        const groupDelta = this._navigationGroupPriority(a.group) - this._navigationGroupPriority(b.group);
        if (groupDelta !== 0) return groupDelta;
        return sortNavigationItems(a, b);
      });
  }

  getAdminWorkspaceGroups(options: { includeInternal?: boolean } = {}): NavigationGroup[] {
    const workspaces = this.getAdminWorkspaces(options);
    const usedGroups = new Set(workspaces.map((workspace) => workspace.group || "data"));
    const configured = this.spec?.["x-openb2c-navigation"]?.groups || [];
    const groups = configured.length > 0 ? configured : [{ id: "data", label: "Data", displayPriority: 100 }];
    const byId = new Map(groups.map((group) => [group.id, group]));

    for (const groupId of usedGroups) {
      if (!byId.has(groupId)) byId.set(groupId, { id: groupId, label: titleCase(groupId), displayPriority: 1000 });
    }

    return [...byId.values()]
      .filter((group) => usedGroups.has(group.id))
      .filter((group) => options.includeInternal || !group.internal)
      .sort(sortNavigationGroups);
  }

  private _navigationGroupPriority(groupId?: string): number {
    const group = (this.spec?.["x-openb2c-navigation"]?.groups || []).find((candidate) => candidate.id === groupId);
    return group?.displayPriority ?? 1000;
  }

  private _isAdminWorkspaceNode(node: EntityGraphNode): boolean {
    if (node.isInternal) return true;
    if (node.isCommerce) return true;
    if (node.isSupport) return false;
    if (isContextualChildNode(node)) return false;
    if (node.isWorkflow) return true;
    if (node.temporalFields.length > 0) return true;
    if (node.outbound.length === 0) return true;
    if (node.inbound.length > 1) return true;
    return node.degree === 0;
  }

  private _isCommerceEntity(entity: string): boolean {
    const commerce = this.getEcommerceConfig();
    if (!commerce?.enabled) return false;
    const entities = [
      commerce.catalog?.entity,
      commerce.order?.entity,
      commerce.lineItem?.entity,
      commerce.transaction?.entity,
    ];
    return entities.includes(entity);
  }

  hasCommerceWorkflow(): boolean {
    if (!this.spec) return false;
    return Boolean(this.spec["x-openb2c-ecommerce"]?.enabled);
  }

  hasIdentityAuth(): boolean {
    if (!this.spec) return false;
    return Boolean(this.spec.paths["/auth/context"]);
  }

  getEcommerceConfig(): any | null {
    return this.spec?.["x-openb2c-ecommerce"] || null;
  }

  getWorkflowScreens(): WorkflowScreen[] {
    const metadata = this.spec?.["x-openb2c-workflows"];
    if (!metadata) return [];
    const groups = metadata.groups || {};
    const operationWorkflows = metadata.operationWorkflows || {};
    const screens = new Map<string, WorkflowScreen>();

    for (const [entity, operations] of Object.entries(operationWorkflows)) {
      for (const workflow of Object.values(operations || {})) {
        const groupId = String(workflow?.group || "");
        if (!groupId || screens.has(groupId)) continue;
        const transition = (workflow?.transitions || []).find((candidate: any) => candidate?.field?.field);
        const statusField = transition?.field?.field || (this.getSchema(entity)?.properties?.status ? "status" : "");
        if (!statusField) continue;
        const group = groups[groupId] || {};
        screens.set(groupId, {
          id: groupId,
          label: group.label || titleCase(groupId),
          description: group.description || "",
          displayPriority: group.displayPriority,
          entity,
          statusField,
          path: `#/workflows/${groupId}`,
        });
      }
    }

    return [...screens.values()].sort((a, b) =>
      (a.displayPriority ?? 1000) - (b.displayPriority ?? 1000) || a.label.localeCompare(b.label)
    );
  }

  getWorkflowScreen(id: string): WorkflowScreen | null {
    return this.getWorkflowScreens().find((screen) => screen.id === id) || null;
  }

  getWorkflowOperations(entity: string, groupId: string): string[] {
    const operations = this.spec?.["x-openb2c-workflows"]?.operationWorkflows?.[entity] || {};
    return Object.entries(operations)
      .filter(([, workflow]) => workflow?.group === groupId)
      .map(([operation]) => operationPathAction(operation));
  }

  getOperationSpec(entity: string, operation: string): any | null {
    return this.spec?.paths?.[`/api/${entity}s/{id}/${operation}`]?.post
      || this.spec?.paths?.[`/api/${entity}s/{id}/${operationPathAction(operation)}`]?.post
      || null;
  }

  getOperationWorkflow(entity: string, operation: string): any | null {
    return this.getOperationSpec(entity, operation)?.["x-openb2c-workflow"] || null;
  }

  getOperationPolicy(entity: string, operation: string): any | null {
    return this.getOperationSpec(entity, operation)?.["x-openb2c-policy"] || null;
  }

  getActionPolicy(entity: string, action: string): any | null {
    if (!this.spec) return null;
    if (action === "read") return this.spec.paths?.[`/api/${entity}s`]?.get?.["x-openb2c-policy"] || null;
    if (action === "create") return this.spec.paths?.[`/api/${entity}s`]?.post?.["x-openb2c-policy"] || null;
    if (action === "update") return this.spec.paths?.[`/api/${entity}s/{id}`]?.put?.["x-openb2c-policy"] || null;
    if (action === "delete") return this.spec.paths?.[`/api/${entity}s/{id}`]?.delete?.["x-openb2c-policy"] || null;
    return this.getOperationPolicy(entity, action);
  }

  hasScope(required: string): boolean {
    return this.authContext.scopes.includes("*") || this.authContext.scopes.includes(required);
  }

  canCollection(entity: string, action: string): boolean {
    const policy = this.getActionPolicy(entity, action);
    if (!policy || policy.public) return true;
    if (!this.hasScope(policy.scope)) return false;
    if (this.authContext.scopes.includes("*")) return true;
    const relationships = policy.relationships || [];
    return relationships.length === 0 || this.authContext.userId !== null;
  }

  can(entity: string, action: string, record?: Record<string, unknown>): boolean {
    const policy = this.getActionPolicy(entity, action);
    if (!policy || policy.public) return true;
    if (!this.hasScope(policy.scope)) return false;
    if (this.authContext.scopes.includes("*")) return true;
    const relationships = policy.relationships || [];
    if (relationships.length === 0) return true;
    if (this.authContext.userId === null || !record) return false;
    return relationships.some((relationship: any) => Number(record[relationship.field?.field]) === this.authContext.userId);
  }

  permissionReason(entity: string, action: string): string {
    const policy = this.getActionPolicy(entity, action);
    if (!policy || policy.public) return "";
    if (this.authContext.userId === null && !this.hasScope(policy.scope)) return "Sign in to access this action.";
    return "Your current session does not include permission for this action.";
  }

  /** Get operations for an entity from OpenAPI paths */
  getOperations(entity: string): string[] {
    if (!this.spec) return [];
    const ops: string[] = [];
    const prefix = `/api/${entity}s/{id}/`;
    for (const path of Object.keys(this.spec.paths)) {
      if (path.startsWith(prefix)) {
        ops.push(path.slice(prefix.length));
      }
    }
    return ops;
  }

  /** Get FK info: which columns reference other entities */
  getForeignKeys(entity: string): Record<string, string> {
    const relationships = this.getForeignKeyRelationships(entity);
    const explicit = Object.fromEntries(
      Object.entries(relationships).map(([field, relationship]) => [field, relationship.targetEntity]),
    ) as Record<string, string>;
    if (Object.keys(explicit).length > 0) return explicit;

    // OpenAPI doesn't carry FK info directly, but column names ending in _id
    // that match another entity are likely FKs. We check against known entities.
    const schema = this.getSchema(entity);
    if (!schema) return {};
    const entities = this.getAllEntities();
    const fks: Record<string, string> = {};
    for (const col of Object.keys(schema.properties || {})) {
      if (col.endsWith("_id")) {
        const ref = col.slice(0, -3);
        if (entities.includes(ref)) fks[col] = ref;
      }
    }
    return fks;
  }

  getForeignKeyRelationships(entity: string): Record<string, any> {
    const schema = this.getSchema(entity);
    if (!schema) return {};
    const relationships: Record<string, any> = {};
    for (const [field, prop] of Object.entries(schema.properties || {}) as [string, any][]) {
      const relationship = prop["x-openb2c-relationship"];
      if (relationship?.targetEntity) relationships[field] = relationship;
    }
    return relationships;
  }

  getFieldRelationship(entity: string, field: string): any | null {
    return this.getForeignKeyRelationships(entity)[field] || null;
  }
}

function pascalCase(s: string): string {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bApi\b/g, "API");
}

function pluralLabel(label: string): string {
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (label.endsWith("s")) return `${label}es`;
  return `${label}s`;
}

function sortNavigationGroups(a: NavigationGroup, b: NavigationGroup): number {
  return (a.displayPriority ?? 1000) - (b.displayPriority ?? 1000) || a.label.localeCompare(b.label);
}

function sortNavigationItems(a: NavigationItem, b: NavigationItem): number {
  return (a.displayPriority ?? 1000) - (b.displayPriority ?? 1000) || a.label.localeCompare(b.label);
}

function workspaceGroup(node: EntityGraphNode, configuredGroup?: string): string {
  if (configuredGroup === "payment" || configuredGroup === "security" || configuredGroup === "system") return configuredGroup;
  if (node.isCommerce) return "commerce";
  if (configuredGroup) return configuredGroup;
  if (node.isWorkflow) return "workflow";
  return "data";
}

function workspacePriority(node: EntityGraphNode, index: number): number {
  if (node.isCommerce) return 10 + index;
  if (node.isWorkflow) {
    const workflowPriority = Math.min(...node.workflowScreens.map((screen) => screen.displayPriority ?? 1000));
    return Number.isFinite(workflowPriority) ? workflowPriority : 100 + index;
  }
  if (node.temporalFields.length > 0) return 200 + index;
  if (node.outbound.length === 0 && node.inbound.length > 0) return 300 + index;
  return 500 + index;
}

function supportEntitiesFor(node: EntityGraphNode, graph: EntityGraph): string[] {
  return graph.nodes
    .filter((candidate) => candidate.isSupport)
    .filter((candidate) => candidate.outbound.some((edge) => edge.targetEntity === node.entity))
    .map((candidate) => candidate.entity)
    .sort();
}

function temporalSchemaFields(schema: any | null): string[] {
  return Object.entries(schema?.properties || {})
    .filter(([field, prop]) => isTemporalField(field, prop))
    .map(([field]) => field);
}

function isTemporalField(field: string, prop: any): boolean {
  if (field === "created_at" || field === "updated_at") return false;
  const format = prop?.["x-openb2c-field"]?.format || prop?.format || "";
  if (format === "date" || format === "time" || format === "date-time") return true;
  return /(^|_)(date|time|starts_at|ends_at|opens_on|closes_on|expires_at)$/.test(field);
}

function temporalFieldsHaveCalendarAnchor(schema: any | null, fields: string[]): boolean {
  return fields.some((field) => {
    const prop = schema?.properties?.[field];
    const format = prop?.["x-openb2c-field"]?.format || prop?.format || "";
    if (format === "date" || format === "date-time") return true;
    if (format === "time") return false;
    return /(^|_)(date|starts_at|ends_at|opens_on|closes_on|expires_at)$/.test(field) || field.endsWith("_at");
  });
}

function isSupportEntity(
  entity: string,
  schema: any | null,
  outbound: EntityGraphEdge[],
  flags: { isInternal: boolean; isCommerce: boolean; isWorkflow: boolean },
): boolean {
  if (flags.isInternal || flags.isCommerce || flags.isWorkflow) return false;
  if (outbound.length < 2) return false;
  if (intrinsicFieldCount(schema, outbound) <= 2) return true;
  return entityNamesCompose(entity, outbound.map((edge) => edge.targetEntity));
}

function isContextualChildNode(node: EntityGraphNode): boolean {
  if (node.temporalFields.length > 0 || node.outbound.length === 0) return false;
  return node.outbound.some((edge) => isOwnershipEdge(node.entity, edge));
}

function isOwnershipEdge(entity: string, edge: EntityGraphEdge): boolean {
  const fieldBase = edge.sourceField.replace(/_id$/, "");
  return fieldBase === edge.targetEntity || entity.split("_").includes(fieldBase);
}

function intrinsicFieldCount(schema: any | null, outbound: EntityGraphEdge[]): number {
  const fkFields = new Set(outbound.map((edge) => edge.sourceField));
  return Object.keys(schema?.properties || {})
    .filter((field) => field !== "id")
    .filter((field) => !fkFields.has(field))
    .filter((field) => !["created_at", "updated_at"].includes(field))
    .length;
}

function entityNamesCompose(entity: string, relatedEntities: string[]): boolean {
  const parts = entity.split("_");
  const related = new Set(relatedEntities);
  for (let i = 1; i < parts.length; i++) {
    const left = parts.slice(0, i).join("_");
    const right = parts.slice(i).join("_");
    if (related.has(left) && related.has(right)) return true;
  }
  return false;
}

function operationPathAction(operation: string): string {
  return operation.replace(/_/g, "-");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

customElements.define("ob-api", ObApi);
