import { Database } from "bun:sqlite";
import { Registry, type Route } from "../core/module";
import { getModule as customerModule } from "../modules/customer/mod";

const db = new Database("opera.db");
db.run("PRAGMA journal_mode = WAL");

const registry = new Registry();
registry.register(customerModule());
registry.initAll(db);

const routes = registry.allRoutes();

/** Match a route pattern like /api/customers/:id against a path. */
function matchRoute(
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.path.split("/");
    const pathParts = path.split("/");
    if (routeParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { route, params };
  }
  return null;
}

const server = Bun.serve({
  port: 3085,
  fetch(req) {
    const url = new URL(req.url);
    const result = matchRoute(req.method, url.pathname);
    if (!result) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return result.route.handler(req, db, result.params);
  },
});

console.log(`Duchy Opera listening on http://localhost:${server.port}`);
