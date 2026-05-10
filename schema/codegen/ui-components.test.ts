import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genAdminAppShell, genAppShell, genPublicAppShell } from "./ui";
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

  test("public and admin app shells target separate web components", () => {
    const publicShell = genPublicAppShell(shellSchema);
    const adminShell = genAdminAppShell(shellSchema);

    expect(publicShell).toContain("<title>Component Shop</title>");
    expect(publicShell).toContain('<ob-app src="openapi.json" api-base="http://localhost:3085"></ob-app>');
    expect(publicShell).not.toContain("ob-admin-app");

    expect(adminShell).toContain("<title>Component Shop Admin</title>");
    expect(adminShell).toContain('<ob-admin-app src="openapi.json" api-base="http://localhost:3085"></ob-admin-app>');
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
    expect(index).toContain('export { ObRouteOutlet }');
    expect(index).toContain('export { ObAdminRouteOutlet }');
  });

  test("public and admin bundles are isolated at their entrypoints", async () => {
    const publicEntry = await Bun.file(join(UI_DIR, "public.ts")).text();
    const adminEntry = await Bun.file(join(UI_DIR, "admin.ts")).text();
    const publicApp = await Bun.file(join(UI_DIR, "components", "ob-app.ts")).text();
    const adminApp = await Bun.file(join(UI_DIR, "components", "ob-admin-app.ts")).text();
    const authMenu = await Bun.file(join(UI_DIR, "components", "ob-auth-menu.ts")).text();
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
    expect(adminNav).toContain('<ob-auth-menu placement="sidebar">');
    expect(authMenu).toContain("setCertificateAuth");
    expect(authMenu).toContain("clearAuthContext");
    expect(authMenu).toContain('observedAttributes');
    expect(authMenu).toContain('placement');
    expect(publicRoute).toContain("./ob-commerce");
    expect(publicRoute).not.toContain("./ob-entity");
    expect(adminRoute).toContain("./ob-entity-list");
    expect(adminRoute).toContain("./ob-entity-form");
    expect(adminRoute).toContain("./ob-entity-detail");
    expect(adminRoute).not.toContain("./ob-commerce");
  });

  test("public and admin bundles only include their required components", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "openb2c-ui-"));
    const publicOut = join(tmp, "public");
    const adminOut = join(tmp, "admin");

    try {
      const publicResult = await Bun.build({
        entrypoints: [join(UI_DIR, "public.ts")],
        outdir: publicOut,
        naming: "app.js",
        minify: true,
      });
      const adminResult = await Bun.build({
        entrypoints: [join(UI_DIR, "admin.ts")],
        outdir: adminOut,
        naming: "app.js",
        minify: true,
      });

      expect(publicResult.success).toBe(true);
      expect(adminResult.success).toBe(true);

      const publicBundle = await Bun.file(join(publicOut, "app.js")).text();
      const adminBundle = await Bun.file(join(adminOut, "app.js")).text();

      expect(publicBundle).toContain("ob-commerce");
      expect(publicBundle).toContain("ob-auth-menu");
      expect(publicBundle).not.toContain("ob-admin-app");
      expect(publicBundle).not.toContain("ob-entity-list");
      expect(publicBundle).not.toContain("ob-entity-form");
      expect(publicBundle).not.toContain("ob-entity-detail");

      expect(adminBundle).toContain("ob-admin-app");
      expect(adminBundle).toContain("ob-entity-list");
      expect(adminBundle).toContain("ob-entity-form");
      expect(adminBundle).toContain("ob-entity-detail");
      expect(adminBundle).toContain("ob-auth-menu");
      expect(adminBundle).not.toContain("ob-commerce");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
