import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { dirname, join, normalize } from "node:path";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { genAdminAppShell, genAppShell, genPublicAppShell } from "./ui";
import { genAdminStylesheet, genPublicStylesheet } from "./ui-styles";
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
    expect(shell).toContain('<link rel="stylesheet" href="styles.css" />');
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
    expect(index).toContain('export { ObAuthPage }');
    expect(index).toContain('export { ObAuthPanel }');
    expect(index).toContain('export { ObAccountSummary }');
    expect(index).toContain('export { ObRouteOutlet }');
    expect(index).toContain('export { ObAdminRouteOutlet }');
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
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain("restoreAuthContext");
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain("setSessionAuth");
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain("bearerToken");
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain("indexedDB.open");
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain('exportKey("jwk"');
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain('exportKey("pkcs8"');
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain('importKey("jwk"');
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain('importKey("pkcs8"');
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain("localStorage.setItem");
    expect(await Bun.file(join(UI_DIR, "components", "ob-api.ts")).text()).toContain('request("/auth/revoke-current"');
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
    expect(adminRoute).toContain('page.setAttribute("context", "admin")');
    expect(adminRoute).toContain("./ob-entity-list");
    expect(adminRoute).toContain("./ob-entity-form");
    expect(adminRoute).toContain("./ob-entity-detail");
    expect(adminRoute).not.toContain("./ob-commerce");
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

      expect(adminBundle).toContain("ob-admin-app");
      expect(adminBundle).toContain("ob-entity-list");
      expect(adminBundle).toContain("ob-entity-form");
      expect(adminBundle).toContain("ob-entity-detail");
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
