# OpenB2C

Composable application framework with Nix-based ontology definition and multi-protocol API generation.

## Overview

OpenB2C lets a small team stitch together an extremely specific operating system for a business from reusable, prebuilt capabilities. A project starts with a small collection of Nix files that define the business ontology: entities, relationships, operations, guards, effects, and the domain modules being composed.

That ontology is the source of truth for the whole system. OpenB2C evaluates the Nix composition and generates the database schema, TypeScript runtime services, REST API, MCP tools, OpenAPI spec, and web client from the same definition. The goal is to let a user compose standard modules, add a few bespoke rules, and avoid hand-maintaining separate backend, API, AI-tool, and web-client contracts.

Authentication uses a fixed platform foundation with configurable domain authorization. OpenB2C standardizes credential handling and the generated `AuthContext`, while each composition declares operation scopes, record relationships, public access, and guards. See [Authentication And Authorization Principles](./docs/auth-and-authorization.md).

Generated API and UI behavior can also derive from field-level presentation, validation, ordering, privacy, redaction, derived display fields, relationship metadata, role/policy metadata, and workflow metadata. See [Field Metadata](./docs/field-metadata.md), [Validation Metadata](./docs/validation-metadata.md), [Derived Fields](./docs/derived-fields.md), [Relationship Metadata](./docs/relationship-metadata.md), [Role And Policy Metadata](./docs/policy-metadata.md), and [Workflow Metadata](./docs/workflow-metadata.md).

## Features

- **Declarative Schema**: Define tables, operations, guards, and effects in Nix
- **Code Generation**: SQL, TypeScript types, services, REST + MCP servers, OpenAPI specs, and a basic web UI
- **Multi-Protocol**: REST API for traditional clients, MCP for AI assistants
- **Type-Safe**: End-to-end type safety from schema to runtime
- **Modular**: Reusable domain modules (user, identity, ticketing, issue tracking, etc.)
- **Federated Identity**: Ed25519-based auth, no passwords, cross-business verification

## Examples

- **[Duchy Opera](./examples/duchyopera/)** - UK charity opera company ticketing platform
- **[Ticketing](./examples/ticketing/)** - internal issue tracking system

## Quick Start

```bash
# Setup (requires Nix with flakes)
direnv allow

# Generate code from a composition
compose examples/duchyopera/composition.nix

# Run the framework test suite
bun test

# Start the generated REST server
cd examples/duchyopera
bun run server

# Or start the generated MCP server
bun run mcp
```

## Available Modules

The framework provides these reusable domain modules:

- **api_key** - Service authentication with scoped API keys
- **artist** - Performers, crew, and contributors
- **customer** - Customer accounts and profiles
- **identity** - Ed25519-based federated authentication
- **issue** - Issue tracking workflow
- **label** - Labels and issue categorization
- **performance** - Events with scheduling and capacity
- **project** - Internal project organization
- **ticket** - Ticket lifecycle (booking → confirmation → use)
- **transaction** - Purchases, refunds, donations, and fulfillment records
- **user** - Shared user identity base
- **user_b2c** - B2C customer profile extension
- **user_internal** - Internal staff/team profile extension
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
└── codegen/           # Code generators

examples/              # Example compositions
├── duchyopera/
│   └── composition.nix  # Declares which modules to use
└── ticketing/
    └── composition.nix

examples/*/generated/  # Generated code (gitignored)
├── schema.sql         # SQLite DDL
├── types.ts           # TypeScript interfaces
├── services.ts        # Business logic
├── server.ts          # REST API
├── mcp.ts             # MCP server
├── openapi.json       # OpenAPI spec
└── ui/                # Basic generated web client
```

## Creating a New Example

1. Create a composition file that imports the modules you need:
   ```nix
   # examples/myapp/composition.nix
   let
     lib = import <nixpkgs/lib>;
     composeLib = import ../../schema/lib/compose.nix { inherit lib; };

     modules = lib.evalModules {
       modules = [
         ../../schema/base.nix
         ../../schema/modules/customer.nix
         ../../schema/modules/identity.nix
         # ... import other modules
       ];
     };

   in {
     organization = modules.config.organization;
     tables = modules.config.tables;
     refs = modules.config.refs;
     relationships = modules.config.relationships;
     operations = composeLib.processOperations modules.config.tables modules.config.relationships modules.config.operations;
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
