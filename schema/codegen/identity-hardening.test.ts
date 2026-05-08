import { describe, expect, test } from "bun:test";
import { genRoutes } from "./server";
import type { Schema } from "./types";
import { DEFAULT_ORGANIZATION_METADATA } from "./utils";

const schema: Schema = {
  organization: DEFAULT_ORGANIZATION_METADATA,
  tables: {},
  operations: {},
};

describe("identity hardening generation", () => {
  test("registry keys are initialized before the server starts", () => {
    const server = genRoutes(schema);

    expect(server).toContain("async function initRegistryPublicKey(): Promise<string>");
    expect(server).toContain("const registryPubKey = await initRegistryPublicKey();");
    expect(server.indexOf("const registryPubKey = await initRegistryPublicKey();")).toBeLessThan(
      server.indexOf("const server = Bun.serve({")
    );
    expect(server).not.toContain("(async () => {");
  });
});
