# OpenB2C

Declarative B2C platform framework with Nix-based schema definition and multi-protocol API generation.

## Overview

Build B2C platforms by declaring your data model in Nix. OpenB2C generates TypeScript services, REST APIs, MCP servers, tests, and OpenAPI specs.

## Features

- **Declarative Schema**: Define tables, operations, guards, and effects in Nix
- **Code Generation**: SQL, TypeScript types, services, REST + MCP servers, integration tests
- **Multi-Protocol**: REST API for traditional clients, MCP for AI assistants
- **Type-Safe**: End-to-end type safety from schema to runtime
- **Modular**: Reusable domain modules (customer, identity, payments, etc.)
- **Federated Identity**: Ed25519-based auth, no passwords, cross-business verification

## Examples

- **[Duchy Opera](./examples/duchyopera/)** - UK charity opera company ticketing platform

## Quick Start

```bash
# Setup (requires Nix with flakes)
direnv allow

# Generate code from a composition
compose examples/duchyopera/composition.nix

# Install dependencies
bun install

# Run tests
bun test

# Start REST server
bun dev

# Start MCP server
bun mcp
```

## Available Modules

The framework provides these reusable domain modules:

- **api_key** - Service authentication with scoped API keys
- **artist** - Performers, crew, and contributors
- **customer** - Customer accounts and profiles
- **identity** - Ed25519-based federated authentication
- **performance** - Events with scheduling and capacity
- **ticket** - Ticket lifecycle (booking → confirmation → use)
- **transaction** - Payment processing and fulfillment
- **venue** - Physical or virtual locations

Examples compose these modules based on their needs.

## Architecture

```
schema/                # Framework
├── modules/           # Reusable domain modules
│   ├── customer.nix
│   ├── identity.nix
│   ├── ticket.nix
│   └── ...
├── lib/expr.nix       # Guard expression builders
├── base.nix           # Module system
├── default.nix        # Module evaluator
└── codegen.ts         # Code generator

examples/              # Example compositions
├── duchyopera/
│   └── composition.nix  # Declares which modules to use

src/generated/         # Generated code (gitignored)
├── schema.sql         # SQLite DDL
├── types.ts           # TypeScript interfaces
├── services.ts        # Business logic
├── server.ts          # REST API
├── mcp.ts             # MCP server
└── integration.test.ts
```

## Creating a New Example

1. Create a composition file that imports the modules you need:
   ```nix
   # examples/myapp/composition.nix
   let
     lib = import <nixpkgs/lib>;

     modules = lib.evalModules {
       modules = [
         ../../schema/base.nix
         ../../schema/modules/customer.nix
         ../../schema/modules/identity.nix
         # ... import other modules
       ];
     };

   in {
     tables = modules.config.tables;
     operations = modules.config.operations;
   }
   ```

2. Generate code:
   ```bash
   compose examples/myapp/composition.nix
   ```

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite
- **Schema**: Nix
- **Language**: TypeScript
- **Protocols**: REST, MCP

## License

See [LICENSE.md](LICENSE.md)
