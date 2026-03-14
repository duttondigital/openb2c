import { Database } from "bun:sqlite";
import { Registry, type Route } from "../core/module";
import { getModule as customerModule } from "../modules/customer/mod";
import { getModule as venueModule } from "../modules/venue/mod";
import { getModule as artistModule } from "../modules/artist/mod";
import { getModule as performanceModule } from "../modules/performance/mod";
import { getModule as ticketModule } from "../modules/ticket/mod";
import { getModule as transactionModule } from "../modules/transaction/mod";

const db = new Database("opera.db");
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

const registry = new Registry();

// Register modules (order doesn't matter - deps are resolved)
registry.register(customerModule());
registry.register(venueModule());
registry.register(artistModule());
registry.register(performanceModule());
registry.register(ticketModule());
registry.register(transactionModule());

registry.initAll(db);

const routes = registry.allRoutes();

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
