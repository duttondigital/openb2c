# OpenB2C

OpenB2C is an opinionated, composable platform for building operational systems for people, families, organisations, and businesses.

The core assumption is that most real-world groups need the same underlying machinery: people, roles, events, resources, documents, tasks, payments, bookings, permissions, notifications, and history. OpenB2C should provide those pieces as reusable, prebuilt functionality that can be composed into a working system, rather than asking each app to invent a schema from scratch.

Nix is the composition layer. A project imports the platform pieces it needs, applies ordinary Nix overrides where necessary, and OpenB2C generates the SQLite schema, TypeScript services, REST API, MCP tools, OpenAPI spec, and web UI from the evaluated configuration.

## Goal

The near-term goal is to prove that opinionated bundles can compose cleanly in one real pilot app: **Duchy Opera**.

That pilot needs both public and private functionality:

- Public commerce: performances, ticket sales, checkout, payments, customer entitlements.
- Private operations: productions, rehearsal scheduling, resource planning, participant calls, production materials, and notifications.

Terminology customization is secondary for now. The priority is making the prebuilt pieces work together coherently and safely.

## Model

OpenB2C is organized around four conceptual layers:

```text
primitives
  Shared product concepts used almost everywhere: principals, events,
  resources, documents, commerce records, tasks, schedules, and history.

capabilities
  Fixed implementation machinery: auth, checkout, payments, calendar sync,
  document storage, notifications, audit logging, migrations, and generated UI.

bundles
  Opinionated combinations of primitives and capabilities:
  ticketed events, production scheduling, materials library, donations,
  memberships, appointments, room booking, and issue tracking.

apps
  Specific compositions for a person, family, organisation, or business.
  Apps mostly choose bundles and providers, but can also directly orchestrate
  primitives and capabilities where no existing bundle fits.
```

The preferred path is to import bundles and configure them. Direct primitive and capability composition is available for genuinely app-specific needs or for patterns that have not yet become reusable bundles. Raw schema and custom behavior should be the last resort.

### Principals

The platform should avoid assuming that every known person is a login account. The broader concept is a principal:

```text
principal
├── person
├── organisation
├── group
└── service
```

A principal may or may not be able to authenticate. Roles are contextual: the same person can be a customer, donor, performer, volunteer, staff member, rehearsal participant, or administrator in different parts of the same app.

### Events

Events are a central primitive. They should support public and private use cases without creating a new schema for every event type.

```text
event
├── kind                  # app-defined: performance, rehearsal, fundraiser
├── visibility            # public | private
├── schedule              # single | series | recurring
├── participation         # none | rsvp | invite_only | ticketed | paid_registration | application
├── resources             # venues, rooms, people, equipment
├── materials             # linked documents/assets, optional
└── workflow              # draft, published, cancelled, completed, etc.
```

Commerce belongs inside participation where it affects how someone joins an event. Resources are allocations with behavior such as display-only, availability-checking, or reservation/blocking. Materials are linked records, not a separate event mode.

## Current Implementation

The current codebase already implements the lower-level generation path:

```text
schema/
├── base.nix              # current Nix option model
├── modules/              # current reusable modules and business concepts
├── lib/                  # expression and composition helpers
├── codegen/              # SQL, TypeScript, REST, MCP, OpenAPI, UI generation
└── ui/                   # generated web component runtime

examples/
├── duchyopera/           # first pilot app
└── ticketing/            # internal workflow example
```

The architecture is expected to evolve from the current `schema/modules` layout toward clearer primitive, capability, and bundle boundaries. Existing Nix module imports remain the composition mechanism.

## Commands

```bash
# Enter the dev shell
direnv allow

# Generate an app
compose examples/duchyopera/composition.nix

# Run the framework test suite from the dev shell
bun test

# Start the generated Duchy Opera REST server
cd examples/duchyopera
bun run server

# Start the generated MCP server
bun run mcp
```

## Stack

- Nix for composition
- Bun and TypeScript for generated runtime code
- SQLite for storage
- REST, MCP, OpenAPI, and generated web UI outputs

## License

See [LICENSE.md](LICENSE.md).
