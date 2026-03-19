# OpenB2C Framework

Declarative B2C platform framework with Nix-based schema definition and multi-protocol API generation.

See [todo.md](todo.md) for roadmap and [examples/](examples/) for implementations.

## Overview

OpenB2C is a code-generation framework for building B2C platforms:

- **Declarative schema**: Define entities and operations in Nix
- **Multi-protocol**: Auto-generates REST API + MCP server
- **Type-safe**: TypeScript throughout
- **Modular**: Compose reusable business domain modules

## Design Principles

- **Declarative**: Business logic in Nix, codegen to TypeScript
- **Backend-first**: REST + MCP APIs, client-agnostic
- **Type-safe**: End-to-end type safety from schema to runtime
- **Simple deployment**: Bun + SQLite, single runtime
- **Federated identity**: Optional Ed25519-based auth module

## Structure

```
schema/                 # Framework
├── modules/*.nix       # Reusable domain modules
├── lib/expr.nix        # Guard expression builders
├── base.nix            # Module system
├── default.nix         # Module evaluator
└── codegen.ts          # Code generator

examples/               # Example compositions
├── duchyopera/
│   ├── composition.nix # Which modules to include
│   └── logo/           # Example-specific assets

src/generated/          # Generated code (gitignored)
├── schema.sql          # SQLite DDL
├── types.ts            # TypeScript interfaces
├── services.ts         # Business logic
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

2. Add module name to example's `composition.nix`

## Creating a New Example

1. Create `examples/<name>/composition.nix`:
   ```nix
   let
     lib = import <nixpkgs/lib>;

     modules = lib.evalModules {
       modules = [
         ../../schema/base.nix
         ../../schema/modules/customer.nix
         ../../schema/modules/identity.nix
         # ... import other modules you need
       ];
     };

   in {
     tables = modules.config.tables;
     operations = modules.config.operations;
   }
   ```

2. Generate code:
   ```bash
   compose examples/<name>/composition.nix
   ```

## Commands

```bash
compose <composition.nix>    # Evaluate composition and generate code
bun test                     # All tests


Note: `compose` is available in your PATH when in the nix shell (via direnv).

## Tech

- **Runtime**: Bun
- **Database**: SQLite
- **Schema**: Nix
- **Dev**: Nix flake
