/**
 * Generates index.html app shell for the UI.
 */
import type { Schema } from "./types";
import { getAppMetadata } from "./utils";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function genAppShell(schema: Schema): string {
  const app = getAppMetadata(schema);
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
      background: var(--ob-shell-bg);
      min-height: 100%;
    }
    ob-app {
      display: block;
      min-height: 100vh;
    }
  </style>
</head>
<body>
  <ob-app src="openapi.json" api-base="${apiBase}"></ob-app>
  <script type="module" src="app.js"></script>
</body>
</html>
`;
}
