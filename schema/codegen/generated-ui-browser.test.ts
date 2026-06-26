import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TEST_TIMEOUT_MS = 120_000;

let browser: Browser | null = null;

type GeneratedApp = {
  dir: string;
  uiDir: string;
};

type TestServer = {
  baseUrl: string;
  stop(): void;
};

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await browser?.close();
}, TEST_TIMEOUT_MS);

describe("generated UI browser automation", () => {
  test("public app supports the generated Duchy Opera checkout and auth journey", async () => {
    const app = await generateExample("duchyopera");
    const api = await startGeneratedApi(app, { authEnabled: true });
    const staticApp = startStaticApp(app.uiDir, api.baseUrl);
    const { context, page, errors } = await newPage();

    try {
      await page.goto(`${staticApp.baseUrl}/index.html#/commerce`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Checkout" }).waitFor();
      await page.getByRole("heading", { name: "Choose Performance" }).waitFor();

      await page.getByRole("button", { name: /The Magic Flute/ }).click();
      await page.getByRole("heading", { name: "Choose details" }).waitFor();
      await page.getByRole("button", { name: /27 Jun 2026.*19:30.*Hall for Cornwall/ }).click();

      await page.getByLabel("Seat").fill("A1");
      await page.getByLabel("Ticket type").selectOption("patron");
      await page.getByRole("button", { name: "Add to cart" }).click();

      await page.getByRole("heading", { name: "Review cart" }).waitFor();
      await page.getByText("Ticket Type: patron").waitFor();
      await page.getByRole("button", { name: "Sign in to checkout" }).click();

      await page.getByRole("heading", { name: "Sign in" }).waitFor();
      await page.getByLabel(/Email/).fill(`ui-checkout-${Date.now()}@example.test`);
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByLabel(/Verification code/).waitFor();
      await page.locator("ob-auth-panel").getByRole("button", { name: "Sign in" }).click();

      await page.getByRole("heading", { name: "Review cart" }).waitFor();
      await page.getByRole("button", { name: "Checkout" }).click();
      await page.getByRole("heading", { name: "Confirm payment" }).waitFor();
      await page.getByRole("button", { name: "Create payment intent" }).click();

      await page.getByRole("heading", { name: "Payment ready" }).waitFor();
      await page.getByText(/fake_pi_/).waitFor();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      staticApp.stop();
      api.stop();
    }
  }, TEST_TIMEOUT_MS);

  test("admin app supports the generated ticketing workflow board", async () => {
    const app = await generateExample("ticketing");
    const api = await startGeneratedApi(app, { authEnabled: false });
    const staticApp = startStaticApp(app.uiDir, api.baseUrl);
    const { context, page, errors } = await newPage();

    try {
      await page.goto(`${staticApp.baseUrl}/admin/index.html#/workflows/issueWorkflow`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Issue workflow" }).waitFor();
      await page.getByText("Harden generated checkout flow").waitFor();

      expect(await page.getByRole("button", { name: "Submit For Review" }).isDisabled()).toBe(true);

      await page.getByRole("button", { name: "Escalate Issue" }).click();
      await page.getByText("This will mark the issue as urgent.").waitFor();
      await page.getByRole("button", { name: "Escalate", exact: true }).click();
      await page.getByText("Escalate issue completed.").waitFor();

      await page.getByRole("button", { name: "Start" }).click();
      await page.getByText("Start completed.").waitFor();
      await page.getByRole("button", { name: "Submit For Review" }).click();
      await page.getByText("Submit For Review completed.").waitFor();
      await page.getByRole("button", { name: "Complete" }).click();
      await page.getByText("Complete completed.").waitFor();

      const doneLane = page.locator(".workflow-lane").filter({ has: page.getByRole("heading", { name: "Done" }) });
      await doneLane.getByText("Harden generated checkout flow").waitFor();
      expect(await doneLane.getByRole("button", { name: "Submit For Review" }).isDisabled()).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      staticApp.stop();
      api.stop();
    }
  }, TEST_TIMEOUT_MS);

  test("admin app supports the generated Duchy Opera production workspace", async () => {
    const app = await generateExample("duchyopera");
    const api = await startGeneratedApi(app, { authEnabled: false });
    const staticApp = startStaticApp(app.uiDir, api.baseUrl);
    const { context, page, errors } = await newPage();

    try {
      await page.goto(`${staticApp.baseUrl}/admin/index.html#/calendar`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Calendar" }).waitFor();
      const calendarOptions = await page.locator("ob-admin-calendar select option").allTextContents();
      expect(calendarOptions).toEqual(expect.arrayContaining(["Performances", "Rehearsals"]));
      expect(calendarOptions).not.toContain("Productions");
      await page.locator("ob-admin-calendar").getByText("The Magic Flute").first().waitFor();

      await page.goto(`${staticApp.baseUrl}/admin/index.html#/workspaces/production/1`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "The Magic Flute" }).waitFor();
      await page.getByRole("heading", { name: "Coverage matrix" }).waitFor();
      await page.getByRole("heading", { name: "Materials" }).waitFor();

      const newRehearsalLink = page.locator('a[href*="/rehearsals/new"][href*="production_id=1"]');
      expect(await newRehearsalLink.count()).toBe(1);
      await newRehearsalLink.click();
      await page.getByRole("heading", { name: "New Rehearsal" }).waitFor();
      expect(await page.locator('ob-entity-form select[name="production_id"]').isDisabled()).toBe(true);

      const rehearsalTitle = `Act II staging ${Date.now()}`;
      await page.getByLabel("Rehearsal").fill(rehearsalTitle);
      await page.getByLabel("Starts").fill("2027-05-22T18:00");
      await page.getByLabel("Ends").fill("2027-05-22T21:00");
      await page.getByRole("button", { name: "Create" }).click();
      await page.waitForURL(`${staticApp.baseUrl}/admin/index.html#/workspaces/production/1`);
      await page.locator("ob-admin-workspace").getByText(rehearsalTitle).first().waitFor();

      const newRequirementLink = page.locator('a[href*="/rehearsal_requirements/new"][href*="production_id=1"]');
      expect(await newRequirementLink.count()).toBeGreaterThan(0);
      await newRequirementLink.first().click();
      await page.getByRole("heading", { name: "New Rehearsal Requirement" }).waitFor();

      const requirementName = `Act II duet ${Date.now()}`;
      await page.getByLabel("Requirement").fill(requirementName);
      await page.getByRole("button", { name: "Create" }).click();
      await page.waitForURL(`${staticApp.baseUrl}/admin/index.html#/workspaces/production/1`);
      await page.locator("ob-admin-workspace").getByText(requirementName).first().waitFor();

      const coverageLinks = page.locator('a[href*="/rehearsal_coverages/new"]');
      expect(await coverageLinks.count()).toBeGreaterThan(0);
      await coverageLinks.first().click();
      await page.getByRole("heading", { name: "New Rehearsal Coverage" }).waitFor();
      expect(await page.locator('ob-entity-form input[type="hidden"][name="requirement_id"]').count()).toBe(1);
      expect(await page.locator('ob-entity-form input[type="hidden"][name="rehearsal_id"]').count()).toBe(1);
      await page.getByRole("button", { name: "Create" }).click();
      await page.waitForURL(`${staticApp.baseUrl}/admin/index.html#/workspaces/production/1`);

      await page.getByRole("heading", { name: "Coverage matrix" }).waitFor();
      const markCovered = page.locator("ob-admin-workspace").getByRole("button", { name: "Mark covered" });
      await markCovered.first().waitFor();
      expect(await markCovered.count()).toBeGreaterThan(0);
      await markCovered.first().click();
      await page.getByText("Mark Covered completed.").waitFor();

      expect(errors).toEqual([]);
    } finally {
      await context.close();
      staticApp.stop();
      api.stop();
    }
  }, TEST_TIMEOUT_MS);
});

async function generateExample(example: "duchyopera" | "ticketing"): Promise<GeneratedApp> {
  const composition = join(PROJECT_ROOT, "examples", example, "composition.nix");
  const schema = await run(["nix", "eval", "--impure", "--json", "-f", composition]);
  const dir = mkdtempSync(join(tmpdir(), `openb2c-${example}-browser-`));
  await run(["bun", join(PROJECT_ROOT, "schema", "codegen", "index.ts"), dir], { input: schema.stdout });
  return { dir, uiDir: join(dir, "ui") };
}

async function startGeneratedApi(app: GeneratedApp, options: { authEnabled: boolean }): Promise<TestServer> {
  const dbPath = join(app.dir, "browser-test.db");
  const restoreEnv = setTemporaryEnv({
    DB_PATH: dbPath,
    PORT: "0",
    AUTH_ENABLED: options.authEnabled ? "true" : "false",
    OPENB2C_APPLY_FIXTURES: "true",
    LOG_LEVEL: "error",
  });

  try {
    const serverModule = await import(`${pathToFileURL(join(app.dir, "server.ts")).href}?t=${Date.now()}-${Math.random()}`);
    const server = serverModule.server as Bun.Server;
    return {
      baseUrl: `http://127.0.0.1:${server.port}`,
      stop: () => server.stop(true),
    };
  } finally {
    restoreEnv();
  }
}

function startStaticApp(rootDir: string, apiBase: string): TestServer {
  const root = resolve(rootDir);
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = normalizePathname(url.pathname);
      const filePath = resolve(root, `.${pathname}`);
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        return new Response("forbidden", { status: 403 });
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return new Response("not found", { status: 404 });
      }

      if (filePath.endsWith(".html")) {
        const html = await Bun.file(filePath).text();
        const injected = html.replace(
          "</head>",
          `  <script>window.OPENB2C_API_BASE = ${JSON.stringify(apiBase)};</script>\n</head>`,
        );
        return new Response(injected, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      return new Response(Bun.file(filePath), { headers: { "content-type": contentType(filePath) } });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

async function newPage(): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  if (!browser) throw new Error("browser was not started");
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}

async function run(
  command: string[],
  options: { input?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(command, {
    cwd: PROJECT_ROOT,
    stdin: options.input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (options.input !== undefined) {
    proc.stdin.write(options.input);
    proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with ${exitCode}\n${stderr || stdout}`);
  }

  return { stdout, stderr, exitCode };
}

function setTemporaryEnv(values: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function normalizePathname(pathname: string): string {
  let decoded = decodeURIComponent(pathname);
  if (decoded === "/") return "/index.html";
  if (decoded.endsWith("/")) decoded += "index.html";
  return decoded;
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
