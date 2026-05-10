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

function genShell(title: string, tagName: "ob-app" | "ob-admin-app", apiBase: string): string {
  const escapedTitle = escapeAttr(title);
  const escapedApiBase = escapeAttr(apiBase);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <${tagName} src="openapi.json" api-base="${escapedApiBase}"></${tagName}>
  <script type="module" src="app.js"></script>
</body>
</html>
`;
}

export function genPublicAppShell(schema: Schema): string {
  const app = getAppMetadata(schema);
  const apiBase = `http://localhost:${app.defaultPorts.server}`;

  return genShell(app.uiTitle, "ob-app", apiBase);
}

export function genAdminAppShell(schema: Schema): string {
  const app = getAppMetadata(schema);
  const apiBase = `http://localhost:${app.defaultPorts.server}`;

  return genShell(`${app.uiTitle} Admin`, "ob-admin-app", apiBase);
}

export const genAppShell = genPublicAppShell;
