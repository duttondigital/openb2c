/**
 * Generates index.html app shell for the UI.
 */
import type { Schema } from "./types";

const INTERNAL_PREFIXES = ["identity_", "api_key"];

export function genAppShell(schema: Schema): string {
  const entities = Object.keys(schema.tables).filter(
    (e) => !INTERNAL_PREFIXES.some((p) => e.startsWith(p))
  );

  // Derive a title from the output directory name (set by caller), fallback to "App"
  const title = "OpenB2C";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      color: #1e293b;
      background: #f8fafc;
    }
    .app {
      display: flex;
      min-height: 100vh;
    }
    #content {
      flex: 1;
      padding: 24px;
      max-width: 1100px;
    }
  </style>
</head>
<body>
  <ob-api src="openapi.json" api-base="http://localhost:3085">
    <div class="app">
      <ob-nav></ob-nav>
      <main id="content"></main>
    </div>
  </ob-api>
  <script type="module" src="app.js"></script>
</body>
</html>
`;
}
