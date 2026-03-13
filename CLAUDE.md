# Duchy Opera

Modular open-source B2C platform for local Cornish businesses.

## Design Principles

- **Narrow scope**: UK-only, GBP-only. No i18n complexity.
- **Composable modules**: Mix-and-match components for any local B2C use case (retail, services, hospitality, etc.)
- **Backend-first**: Client-agnostic API. Maximum accessibility, flexibility, and compatibility (web, mobile, LLM/agentic UX).
- **Cheap to run**: Bun + SQLite. Single runtime, low resource usage.
- **Open source**: GPL-3 licensed.

## Structure

```
src/
├── core/            # Core framework
│   └── module.ts    # Module contract, registry, schema migration
├── modules/         # Composable business modules
│   └── customer/    # Example: customer management
└── server/          # HTTP server (Bun.serve)
    └── index.ts     # Entry point, route matching
```

## Module System

Each module implements a standard contract:

```ts
interface Module {
  name: string;           // unique identifier e.g. "customer"
  deps: string[];         // names of required modules
  schema: string;         // SQL schema (CREATE TABLE statements)
  init?: (db: Database) => void;  // module initialization
  routes: Route[];        // HTTP routes
}
```

### Creating a Module

1. Create directory `src/modules/<name>/`
2. Add files:
   - `mod.ts` - Module definition with `getModule()` function
   - `types.ts` - TypeScript interfaces
   - `handlers.ts` - HTTP handlers

3. Register in `src/server/index.ts`:
   ```ts
   import { getModule as myModule } from "../modules/mymodule/mod";
   registry.register(myModule());
   ```

### Schema Tracking

Schemas are tracked in `_modules` table. Rerunning applies only new modules.

## Development

```bash
bun dev         # Run server (requires nix devshell via direnv or `nix develop`)
```

## Tech

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite (`bun:sqlite`)
- **Dev environment**: Nix flake
