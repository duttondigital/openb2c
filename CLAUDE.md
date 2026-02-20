# Duchy Opera

Modular open-source B2C platform for local Cornish businesses.

## Design Principles

- **Narrow scope**: UK-only, GBP-only. No i18n complexity.
- **Composable modules**: Mix-and-match components for any local B2C use case (retail, services, hospitality, etc.)
- **Backend-first**: Client-agnostic API. Maximum accessibility, flexibility, and compatibility (web, mobile, LLM/agentic UX).
- **Cheap to run**: Odin + SQLite. Minimal dependencies, single binary, low resource usage.
- **Open source**: GPL-3 licensed.

## Structure

```
src/
├── core/            # Core framework
│   └── module.odin  # Module contract, registry, schema migration
├── modules/         # Composable business modules
│   └── customer/    # Example: customer management
├── server/          # HTTP server and routing
│   └── http/        # HTTP primitives
├── markdown/        # Markdown processing
└── sqlite/          # Database layer
```

## Module System

Each module implements a standard contract:

```odin
Module :: struct {
    name:   string,           // unique identifier e.g. "customer"
    deps:   []string,         // names of required modules
    schema: string,           // SQL schema (CREATE TABLE statements)
    init:   proc(db) -> bool, // module initialization
    routes: []Route,          // HTTP routes
}
```

### Creating a Module

1. Create directory `src/modules/<name>/`
2. Add files:
   - `mod.odin` - Module definition with `get_module()` proc
   - `schema.sql` - SQL schema (loaded via `#load`)
   - `types.odin` - Data types
   - `handlers.odin` - HTTP handlers

3. Register in `src/server/main.odin`:
   ```odin
   import "../modules/mymodule"
   core.register(&registry, mymodule.get_module())
   ```

### Schema Tracking

Schemas are tracked in `_modules` table. Rerunning applies only new modules.

## Development

```bash
./dev.sh         # Run server (requires nix devshell via direnv or `nix develop`)
```

## Tech

- **Language**: Odin
- **Database**: SQLite
- **Build**: Nix flake
