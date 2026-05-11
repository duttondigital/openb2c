/**
 * <ob-api src="openapi.json"> — Fetches and caches the OpenAPI spec, provides context to children.
 */
export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, any>; securitySchemes?: Record<string, any> };
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
    this.apiBase = (this.getAttribute("api-base") || "").replace(/\/$/, "");
    const src = this.getAttribute("src") || "openapi.json";
    const res = await fetch(src);
    this.spec = await res.json();
    await this.restoreAuthContext();
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
    return Boolean(this.spec["x-openb2c-ecommerce"]?.enabled);
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
