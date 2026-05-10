/**
 * <ob-api src="openapi.json"> — Fetches and caches the OpenAPI spec, provides context to children.
 */
export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, any> };
  "x-openb2c-organization"?: {
    name?: string;
    description?: string;
    logo?: { src: string; alt: string | null } | null;
  };
  "x-openb2c-ecommerce"?: any;
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
    this._certificate = null;
    this._privateKey = null;
    this.dispatchEvent(new CustomEvent("ob-auth-changed", { bubbles: true, detail: auth }));
  }

  async setCertificateAuth(certificate: Certificate, privateKey: CryptoKey): Promise<AuthContext> {
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
    this.dispatchEvent(new CustomEvent("ob-auth-changed", { bubbles: true, detail: auth }));
    return auth;
  }

  clearAuthContext() {
    this._certificate = null;
    this._privateKey = null;
    this.setAuthContext(ANONYMOUS_AUTH_CONTEXT);
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

  hasCommerceWorkflow(): boolean {
    if (!this.spec) return false;
    return Boolean(
      this.spec["x-openb2c-ecommerce"]?.enabled ||
      (this.spec.paths["/commerce/checkout"] &&
        this.spec.paths["/commerce/orders/{id}/payment-intent"]) ||
      (this.spec.paths["/commerce/bookings/reserve"] &&
        this.spec.paths["/commerce/bookings/{id}/payment-intent"])
    );
  }

  hasIdentityAuth(): boolean {
    if (!this.spec) return false;
    return Boolean(this.spec.paths["/auth/context"]);
  }

  getEcommerceConfig(): any | null {
    return this.spec?.["x-openb2c-ecommerce"] || null;
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

customElements.define("ob-api", ObApi);
