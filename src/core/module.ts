import { Database } from "bun:sqlite";

export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (
    req: Request,
    db: Database,
    params: Record<string, string>,
  ) => Response;
}

export interface Module {
  name: string;
  deps: string[];
  schema: string;
  init?: (db: Database) => void;
  routes: Route[];
}

export class Registry {
  private modules: Module[] = [];

  register(mod: Module) {
    this.modules.push(mod);
  }

  /** Topological sort — returns modules in dependency order. */
  resolveOrder(): Module[] {
    const byName = new Map<string, Module>();
    for (const m of this.modules) byName.set(m.name, m);

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const m of this.modules) {
      inDegree.set(m.name, m.deps.length);
      for (const dep of m.deps) {
        if (!byName.has(dep))
          throw new Error(`Module "${m.name}" depends on unknown module "${dep}"`);
        const list = dependents.get(dep) ?? [];
        list.push(m.name);
        dependents.set(dep, list);
      }
    }

    const queue: string[] = [];
    for (const [name, deg] of inDegree) if (deg === 0) queue.push(name);

    const sorted: Module[] = [];
    while (queue.length) {
      const name = queue.shift()!;
      sorted.push(byName.get(name)!);
      for (const dep of dependents.get(name) ?? []) {
        const newDeg = inDegree.get(dep)! - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }

    if (sorted.length !== this.modules.length)
      throw new Error("Circular dependency detected");

    return sorted;
  }

  /** Create tracking table, apply schemas, run init hooks. */
  initAll(db: Database) {
    db.run(`
      CREATE TABLE IF NOT EXISTS _modules (
        name TEXT PRIMARY KEY,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const mod of this.resolveOrder()) {
      const row = db
        .query("SELECT 1 FROM _modules WHERE name = ?")
        .get(mod.name);

      if (!row) {
        db.run(mod.schema);
        db.run("INSERT INTO _modules (name) VALUES (?)", [mod.name]);
      }

      mod.init?.(db);
    }
  }

  /** Collect all routes from every registered module. */
  allRoutes(): Route[] {
    return this.modules.flatMap((m) => m.routes);
  }
}
