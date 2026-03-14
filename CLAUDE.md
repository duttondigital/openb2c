# Duchy Opera

Open-source B2C platform for Cornish charity opera company.

See [todo.md](todo.md) for roadmap.

## Vision

Combat US tech oligopoly by restoring agency to smaller UK businesses. Rather than blanket solutions for the world, build targeted solutions for proximal issues.

Standardised backend (REST + MCP) enables client agnosticism on both ends of B2C:
- **Businesses** choose their own frontends, integrate with existing tools
- **Customers** use any client (web, native, AI assistant, accessibility tools)

Federated identity (Ed25519 + email verification) means customers verify once, authenticate everywhere. No passwords, no per-business accounts, no platform lock-in.

## Design Principles

- **Narrow scope**: UK-only, GBP-only. No i18n.
- **Declarative**: Business logic in Nix, codegen to TypeScript.
- **Backend-first**: REST + MCP APIs. Client-agnostic.
- **Cheap to run**: Bun + SQLite. Single runtime.

## Structure

```
schema/                 # Nix source of truth
├── modules/*.nix       # Entity definitions (tables, operations)
├── lib/expr.nix        # AST builders for guards
├── base.nix            # Module options
├── default.nix         # Composition
└── codegen.ts          # Nix JSON → TypeScript

src/generated/          # All generated (gitignored)
├── schema.sql          # SQLite DDL
├── types.ts            # TypeScript interfaces
├── services.ts         # CRUD + operations
├── server.ts           # REST API
├── mcp.ts              # MCP server
└── integration.test.ts # E2E tests
```

## Adding a Module

1. Create `schema/modules/<name>.nix`:
   ```nix
   { config, lib, ... }:
   let E = import ../lib/expr.nix;
   in {
     tables.<name> = {
       id = { type = "integer"; pk = true; auto = true; };
       # columns...
     };
     operations.<name> = {
       myOp = {
         guard = E.eq (E.f "status") (E.lit "pending");
         set = { status = "active"; };
         effects = [{ emit = "<name>.activated"; }];
       };
     };
   }
   ```

2. Import in `schema/default.nix`

3. Run `bun codegen`

## Commands

```bash
bun codegen     # Regenerate from Nix
bun dev         # REST server :3085
bun mcp         # MCP server (stdio)
bun test        # All tests
```

## Tech

- **Runtime**: Bun
- **Database**: SQLite
- **Schema**: Nix
- **Dev**: Nix flake
