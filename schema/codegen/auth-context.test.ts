import { describe, expect, test } from "bun:test";
import { genMcpServer } from "./mcp";
import { genRoutes } from "./server";
import { genServices } from "./services";
import { genTypes } from "./typescript";
import type { Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {
    note: {
      id: { type: "integer", pk: true, auto: true, required: false, unique: false, default: null, references: null },
      title: { type: "text", pk: false, auto: false, required: true, unique: false, default: null, references: null },
      status: { type: "text", pk: false, auto: false, required: false, unique: false, default: "'draft'", references: null },
    },
  },
  operations: {
    note: {
      publish: {
        guard: null,
        relationships: [],
        public: false,
        scope: null,
        set: { status: "published" },
        cascade: [],
        effects: [],
      },
    },
  },
};

describe("auth context generation", () => {
  test("generated types include minimal shared auth context shape", () => {
    const types = genTypes(schema.tables, schema.operations);

    expect(types).toContain("export type PermissionScope = string");
    expect(types).toContain("export interface AuthContext");
    expect(types).toContain("userId: number | null");
    expect(types).toContain("scopes: PermissionScope[]");
    expect(types).toContain("export const ANONYMOUS_AUTH_CONTEXT");
    expect(types).toContain("export const SYSTEM_AUTH_CONTEXT");
    expect(types).toContain("export interface FieldRef");
    expect(types).toContain("export interface Relationship");
    expect(types).toContain("export interface OperationPolicy");
    expect(types).not.toContain("PlatformPrincipal");
    expect(types).not.toContain("principals:");
    expect(types).not.toContain("roles:");
    expect(types).not.toContain("claims:");
    expect(types).not.toContain("ApiKeyAuthContext");
  });

  test("generated services accept auth context", () => {
    const services = genServices(schema);

    expect(services).toContain("import * as T from \"./types\";");
    expect(services).toContain("Promise<T.AuthContext | null>");
    expect(services).toContain("userId: row.user_id");
    expect(services).toContain("scopes: row.scopes.split");
    expect(services).toContain("export const SELF_SERVICE_SCOPES");
    expect(services).toContain("const OPERATION_POLICY");
    expect(services).toContain("return hasScope(auth, policy.scope) && matchesRelationship(auth, policy, record);");
    expect(services).toContain("findNoteById(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).toContain("findAllNotes(db: Database, opts: ListOptions = {}, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).toContain("createNote(db: Database, input: T.NoteInput, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).toContain("publishNote(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).not.toContain("principals");
    expect(services).not.toContain("roles");
    expect(services).not.toContain("claims");
  });

  test("generated REST and MCP handlers pass auth context to services", () => {
    const server = genRoutes(schema);
    const mcp = genMcpServer(schema);

    expect(server).toContain("import * as T from \"./types\";");
    expect(server).toContain("type Handler = (req: Request, params: Record<string, string>, auth: T.AuthContext)");
    expect(server).toContain("let authContext: T.AuthContext = AUTH_ENABLED ? T.ANONYMOUS_AUTH_CONTEXT : T.SYSTEM_AUTH_CONTEXT;");
    expect(server).toContain("authContext = auth;");
    expect(server).toContain("scopes: [...S.SELF_SERVICE_SCOPES]");
    expect(server).not.toContain("kind: \"identity\"");
    expect(server).not.toContain("provider: \"certificate\"");
    expect(server).not.toContain("principals:");
    expect(server).not.toContain("roles:");
    expect(server).toContain("S.findAllNotes(db, { limit, offset, sort, order, filter: Object.keys(filter).length ? filter : undefined }, auth)");
    expect(server).toContain("S.publishNote(db, +p.id, auth)");
    expect(server).toContain("result.route.handler(req, result.params, authContext)");

    expect(mcp).toContain("const MCP_AUTH_CONTEXT = T.SYSTEM_AUTH_CONTEXT;");
    expect(mcp).toContain("S.findAllNotes(db, {}, auth)");
    expect(mcp).toContain("S.createNote(db, args as T.NoteInput, auth)");
    expect(mcp).toContain("S.publishNote(db, args.id as number, auth)");
  });
});
