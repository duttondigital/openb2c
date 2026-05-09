/**
 * Generates index.html app shell for the UI.
 */
import type { Schema } from "./types";
import { getAppMetadata } from "./utils";

const INTERNAL_PREFIXES = ["identity_", "api_key"];

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function genAppShell(schema: Schema): string {
  const app = getAppMetadata(schema);
  const entities = Object.keys(schema.tables).filter(
    (e) => !INTERNAL_PREFIXES.some((p) => e.startsWith(p))
  );

  const title = escapeAttr(app.uiTitle);
  const apiBase = escapeAttr(`http://localhost:${app.defaultPorts.server}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --ob-shell-bg: #f7f7f4;
      --ob-shell-text: #242521;
      --ob-shell-border: #dedbd2;
      --ob-shell-focus: 0 0 0 3px rgba(17, 17, 17, 0.16);
      --ob-nav-width: 248px;
    }
    html {
      min-height: 100%;
      background: var(--ob-shell-bg);
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--ob-shell-text);
      background: var(--ob-shell-bg);
      min-height: 100%;
    }
    .skip-link {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 10;
      transform: translateY(-140%);
      padding: 8px 12px;
      border-radius: 8px;
      background: #ffffff;
      color: #111111;
      box-shadow: var(--ob-shell-focus);
      font-weight: 700;
      text-decoration: none;
    }
    .skip-link:focus {
      transform: translateY(0);
    }
    .app {
      display: flex;
      min-height: 100vh;
    }
    ob-nav {
      flex: 0 0 var(--ob-nav-width);
    }
    #content {
      flex: 1;
      min-width: 0;
      width: 100%;
      max-width: 1280px;
      padding: 32px;
      margin: 0 auto;
    }
    #content:focus {
      outline: none;
    }
    @media (max-width: 780px) {
      .app {
        flex-direction: column;
      }
      ob-nav {
        flex-basis: auto;
      }
      #content {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <ob-api src="openapi.json" api-base="${apiBase}">
    <div class="app">
      <ob-nav></ob-nav>
      <main id="content" tabindex="-1"></main>
    </div>
  </ob-api>
  <script type="module" src="app.js"></script>
</body>
</html>
`;
}
