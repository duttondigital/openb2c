# Authentication And Authorization Principles

OpenB2C uses a fixed platform authentication foundation and a configurable authorization layer.
Generated apps should share the same security machinery, while each composition declares who may do what in its own domain.

## Standardized Platform Layer

These concepts are platform behavior and should not be redefined by each composition:

- Credential protocols: API keys for machine access and certificate/request signing for federated identity.
- Request authentication: generated REST and MCP entrypoints parse credentials, validate them, and produce a normalized auth context.
- Auth context shape: every generated handler and service receives the same `AuthContext`.
- Secret handling: API key hashing, signing key loading, certificate validation, and future revocation checks.
- Error semantics: missing credentials return `401`, insufficient permission returns `403`, and errors use the generated structured shape.
- Enforcement hook: generated services accept auth context so authorization can be enforced consistently below REST and MCP.

## Platform Principals

OpenB2C defines a small platform vocabulary that every composition can rely on:

- `anonymous`: unauthenticated public actor.
- `user`: authenticated human identity.
- `customer`: external/end-user identity.
- `staff`: internal/operator identity.
- `admin`: elevated operator.
- `service`: machine/API-key actor.
- `owner`: policy pseudo-principal resolved against a specific record, such as `ticket.user_id == auth.userId`.

`owner` is not stored on an auth context. It only makes sense while evaluating an authorization rule for a concrete resource.

The canonical helper definitions live in `schema/lib/auth.nix`. Domain modules use those helpers when declaring authorization metadata.

## Configurable Domain Layer

These concepts vary by organization and domain module and should be declared in ontology metadata:

- Domain roles such as `artist`, `project_member`, `assignee`, `reporter`, `patron`, or `venue_manager`.
- Permission scopes such as `ticket.read`, `ticket.refund`, `issue.assign`, or `performance.cancel`.
- Entity CRUD policy for read, create, update, and delete.
- Operation policy for workflow actions such as refunding transactions or assigning issues.
- Relationship-scoped access, such as project members reading issues in their project.
- Claim-to-role mapping, such as verified email domains or API key scopes granting domain roles.

Domain policy should refer to normalized principals, roles, scopes, claims, and relationships. It should not duplicate provider-specific checks.

## Policy Semantics

Authorization is declared per entity:

```nix
authorization.ticket = {
  ownerFields = [ "user_id" ];
  read.allow = [
    A.operator
    A.ownerUser
    (A.ownerService [ "ticket.read" "read" ])
  ];
  operations.confirm.allow = [
    A.operator
    A.ownerUser
    (A.scopedAny [ "ticket.confirm" ])
  ];
};
```

Rules in `allow` are ORed. Fields inside a rule are ANDed:

- `principals`: one authenticated platform principal must match.
- `roles`: one domain role must match.
- `scopes`: one permission scope must match. `*` remains an explicit escape hatch for privileged service contexts.
- `owner = true`: the record or input must match `auth.userId` through the entity `ownerFields`, or rule-specific `ownerFields`.

Missing entity policy is treated as unrestricted for backwards-compatible generated schemas. Once an entity declares policy, missing actions deny by default. Generated services enforce CRUD and operation policy directly, so REST and MCP cannot bypass authorization by calling the service layer differently.

## Owner Rules

Owner-scoped access is resource-specific. Current modules declare owner fields for user-owned records:

- `ticket.user_id`
- `transaction.user_id`
- `comment.author_id`
- `issue.creator_id` and `issue.assignee_id`
- `project.owner_id`
- `api_key.user_id`
- `user.id`

List and count operations constrain SQL by matching owner fields where possible, then re-check each returned row through the same policy helper.

## Operation Permissions

Operations use action names in the form `operation:<name>` internally and are configured under `authorization.<entity>.operations.<name>`.
This means a broad `write` scope does not automatically authorize workflow actions. A module can choose to accept `write`, but operation-specific scopes such as `ticket.confirm`, `transaction.refund`, or `issue.assign` are the preferred contract.

## System Configuration

These values are deployment concerns, not ontology concerns:

- Enabled auth providers.
- Registry signing keys and other secrets.
- CORS origins.
- Rate limits and request limits.
- Production startup constraints.
- Ports, database paths, and public base URLs.

## Generated Contract

Generated `types.ts` exposes the shared contract:

```ts
export type PlatformPrincipal =
  | "anonymous"
  | "user"
  | "customer"
  | "staff"
  | "admin"
  | "service"
  | "owner";

export interface BaseAuthContext {
  provider: "anonymous" | "api_key" | "certificate" | "system";
  subject: string | null;
  userId: number | null;
  principals: PlatformPrincipal[];
  roles: string[];
  scopes: string[];
  claims: Record<string, unknown>;
}
```

The generator owns how credentials become this context. The ontology owns the policies that consume it. `SYSTEM_AUTH_CONTEXT` is reserved for trusted local/system execution, such as auth-disabled development runs and local MCP execution.
