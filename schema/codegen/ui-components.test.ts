import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { genAppShell } from "./ui";
import type { Schema } from "./types";

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

describe("generated UI web components", () => {
  test("app shell delegates layout and routing to web components", () => {
    const shell = genAppShell(shellSchema);

    expect(shell).toContain('<ob-app src="openapi.json" api-base="http://localhost:3085"></ob-app>');
    expect(shell).not.toContain('id="content"');
    expect(shell).not.toContain("#content");
    expect(shell).not.toContain("<ob-api");
  });

  test("component behavior is not wired through id lookups", async () => {
    const componentDir = join(UI_DIR, "components");
    const files = [
      join(UI_DIR, "index.ts"),
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
    expect(index).toContain('export { ObRouteOutlet }');
  });
});
