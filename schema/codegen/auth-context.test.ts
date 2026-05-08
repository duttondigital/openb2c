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
        set: { status: "published" },
        cascade: [],
        effects: [],
      },
    },
  },
};

describe("auth context generation", () => {
  test("generated types include shared auth context shapes", () => {
    const types = genTypes(schema.tables);

    expect(types).toContain("export const PLATFORM_PRINCIPALS");
    expect(types).toContain("export type PlatformPrincipal");
    expect(types).toContain("\"anonymous\"");
    expect(types).toContain("\"customer\"");
    expect(types).toContain("\"staff\"");
    expect(types).toContain("\"admin\"");
    expect(types).toContain("\"service\"");
    expect(types).toContain("\"owner\"");
    expect(types).toContain("export const POLICY_ONLY_PLATFORM_PRINCIPALS");
    expect(types).toContain("export interface BaseAuthContext");
    expect(types).toContain("principals: PlatformPrincipal[]");
    expect(types).toContain("roles: DomainRole[]");
    expect(types).toContain("claims: Record<string, unknown>");
    expect(types).toContain("export interface ApiKeyAuthContext");
    expect(types).toContain("export interface IdentityAuthContext");
    expect(types).toContain("export type AuthContext");
    expect(types).toContain("export const ANONYMOUS_AUTH_CONTEXT");
  });

  test("generated services accept auth context", () => {
    const services = genServices(schema);

    expect(services).toContain("import * as T from \"./types\";");
    expect(services).toContain("Promise<T.ApiKeyAuthContext | null>");
    expect(services).toContain("kind: \"api_key\"");
    expect(services).toContain("provider: \"api_key\"");
    expect(services).toContain("principals: uniquePrincipals([\"service\", ...userAttrs.principals])");
    expect(services).toContain("claims: { ...userAttrs.claims, keyId: row.id, userId: row.user_id }");
    expect(services).toContain("export function getUserAuthAttributes");
    expect(services).toContain("findNoteById(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).toContain("findAllNotes(db: Database, opts: ListOptions = {}, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).toContain("createNote(db: Database, input: T.NoteInput, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
    expect(services).toContain("publishNote(db: Database, id: number, auth: T.AuthContext = T.ANONYMOUS_AUTH_CONTEXT)");
  });

  test("generated REST and MCP handlers pass auth context to services", () => {
    const server = genRoutes(schema);
    const mcp = genMcpServer(schema);

    expect(server).toContain("import * as T from \"./types\";");
    expect(server).toContain("type Handler = (req: Request, params: Record<string, string>, auth: T.AuthContext)");
    expect(server).toContain("let authContext: T.AuthContext = AUTH_ENABLED ? T.ANONYMOUS_AUTH_CONTEXT : T.SYSTEM_AUTH_CONTEXT;");
    expect(server).toContain("authContext = auth;");
    expect(server).toContain("kind: \"identity\"");
    expect(server).toContain("provider: \"certificate\"");
    expect(server).toContain("principals: userAttrs.principals.length ? userAttrs.principals : [\"user\"]");
    expect(server).toContain("roles: userAttrs.roles");
    expect(server).toContain("S.findAllNotes(db, { limit, offset, sort, order, filter: Object.keys(filter).length ? filter : undefined }, auth)");
    expect(server).toContain("S.publishNote(db, +p.id, auth)");
    expect(server).toContain("result.route.handler(req, result.params, authContext)");

    expect(mcp).toContain("const MCP_AUTH_CONTEXT = T.SYSTEM_AUTH_CONTEXT;");
    expect(mcp).toContain("S.findAllNotes(db, {}, auth)");
    expect(mcp).toContain("S.createNote(db, args as T.NoteInput, auth)");
    expect(mcp).toContain("S.publishNote(db, args.id as number, auth)");
  });
});
