/**
 * <ob-api src="openapi.json"> — Fetches and caches the OpenAPI spec, provides context to children.
 */
export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, any> };
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

export const ANONYMOUS_AUTH_CONTEXT: AuthContext = {
  userId: null,
  scopes: [],
};

export const SYSTEM_AUTH_CONTEXT: AuthContext = {
  userId: null,
  scopes: ["*"],
};

let _instance: ObApi | null = null;

export class ObApi extends HTMLElement {
  spec: OpenAPISpec | null = null;
  authContext: AuthContext = ANONYMOUS_AUTH_CONTEXT;
  /** Base URL for API calls (e.g., "http://localhost:<port>"). Empty string means same origin. */
  apiBase = "";
  private _bearerToken = "";
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
    this.apiBase = (this.getAttribute("api-base") || "").replace(/\/$/, "");
    const src = this.getAttribute("src") || "openapi.json";
    const res = await fetch(src);
    this.spec = await res.json();
    this._resolve();
    this.dispatchEvent(new CustomEvent("ob-spec-ready", { bubbles: true }));
  }

  /** Build a full API URL from a path like /api/issues */
  url(path: string): string {
    return this.apiBase + path;
  }

  setAuthContext(auth: AuthContext, bearerToken = "") {
    this.authContext = auth;
    this._bearerToken = bearerToken;
    this.dispatchEvent(new CustomEvent("ob-auth-changed", { bubbles: true, detail: auth }));
  }

  clearAuthContext() {
    this.setAuthContext(ANONYMOUS_AUTH_CONTEXT);
  }

  request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this._bearerToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this._bearerToken}`);
    }
    return fetch(this.url(path), { ...init, headers });
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
    if (!this.spec) return [];
    const all = new Set<string>();
    for (const path of Object.keys(this.spec.paths)) {
      const m = path.match(/^\/api\/([a-z_]+)s$/);
      if (m) all.add(m[1]);
    }
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
    // OpenAPI doesn't carry FK info directly, but column names ending in _id
    // that match another entity are likely FKs. We check against known entities.
    const schema = this.getSchema(entity);
    if (!schema) return {};
    const entities = this.getEntities();
    const fks: Record<string, string> = {};
    for (const col of Object.keys(schema.properties || {})) {
      if (col.endsWith("_id")) {
        const ref = col.slice(0, -3);
        if (entities.includes(ref)) fks[col] = ref;
      }
    }
    return fks;
  }
}

function pascalCase(s: string): string {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

customElements.define("ob-api", ObApi);
