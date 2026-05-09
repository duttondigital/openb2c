# Authentication And Authorization Principles

OpenB2C keeps authentication standardized and keeps authorization declarative.
Generated apps should all answer the same questions in the same order:

1. Who is this user?
2. Does this user have the scope for this operation type?
3. Is this user related to this specific record in an allowed way?
4. Does the record satisfy the operation guard?

## Standard Platform Layer

These concepts are platform behavior and should not be redefined by each composition:

- Credential protocols: API keys for machine access and certificate/request signing for federated identity.
- Credential transport: REST uses HTTP headers; MCP and local callers may pass context directly.
- Request authentication: generated entrypoints validate credentials and normalize them to one auth context.
- Secret handling: API key hashing, signing key loading, certificate validation, and future revocation checks.
- Error semantics: missing credentials return `401`, insufficient permission returns `403`.
- Enforcement location: generated services enforce authorization below REST and MCP.

## Auth Context

Generated services receive the smallest context needed for authorization:

```ts
export interface AuthContext {
  userId: number | null;
  scopes: string[];
}
```

`userId` identifies the authenticated user record. API keys are always bound to a user, so API-key calls still act on behalf of a user.

`scopes` are the normalized permission grants available to the caller. The service layer does not branch on principals, roles, claims, providers, credential kinds, or subjects. Roles can exist as product data or as an issuance-time concept, but generated enforcement consumes their resulting scopes.

`SYSTEM_AUTH_CONTEXT` uses `scopes: ["*"]` and is reserved for trusted local/system execution such as auth-disabled development and local MCP execution.

## Certificate Registry State

Certificate authentication always verifies two cryptographic signatures:

- the certificate signature from the configured registry public key
- the request signature from the certificate's user public key

Generated servers then apply an explicit registry-state model:

- Local registry mode is used when the app has a registry private key, or when development mode generates an ephemeral registry key. A certificate must have an active local `identity_registry` row with the same email and public key.
- External registry mode is used when only `REGISTRY_PUBLIC_KEY` is configured. The external signature is authoritative, and the local `identity_registry` table acts as an override/denylist.
- In both modes, a matching local row with `revoked = 1` rejects the certificate.

This keeps local deployments stateful enough for revocation and rotation while still allowing a future external registry to verify identities without pre-seeding every user locally.

## Operation Scopes

Every table has implicit CRUD operations:

- `<entity>.read`
- `<entity>.create`
- `<entity>.update`
- `<entity>.delete`

Custom operations use the same convention: `<entity>.<operation>`.
For example, `operations.ticket.confirm` derives the scope `ticket.confirm`.

An operation may set `scope` to override the derived value, but this should be rare. The config path is the default contract, so authors do not need to repeat strings such as `issue.update` inside an `issue.update` operation.

Federated identity receives generated self-service scopes for non-public operations that are constrained by relationships. API keys store explicit comma-separated scopes. The `*` scope is an explicit system escape hatch.

## Relationships

Scopes answer whether a caller can perform an operation type. Relationships answer whether the caller can perform it on this record.

Relationships are requested by name and resolved by convention during composition.
The generated schema still receives structured field refs, but module authors usually only write strings:

```nix
tables.issue.creator_id = { type = "integer"; references = "user(id)"; };
tables.issue.assignee_id = { type = "integer"; references = "user(id)"; };

operations.issue = {
  read.relationships = [ "creator" "assignee" ];
  create.relationships = [ "creator" ];
  update.relationships = [ "creator" "assignee" ];

  complete = {
    guard = E.eq (E.f "status") (E.lit "in_review");
    set = { status = "done"; };
  };
};
```

The resolver maps a requested relationship `x` to `<entity>.x_id`, and only accepts it if that field references `user(id)`.
The relationship `user` maps to `<entity>.user_id`.
On the `user` entity, `self` maps to `user.id`.

Entities with `<entity>.user_id -> user(id)` get user-scoped CRUD by default.
Custom operations inherit the entity's update relationship policy unless they set `relationships` explicitly.

Use `relationships = []` for operations that are intentionally global once the caller has the operation scope.
Use explicit structured relationships only when the field name cannot follow the convention:

```nix
relationships.issue.reviewer.field = config.refs.issue.reviewed_by_user_id;
operations.issue.review.relationships = [ "reviewer" ];
```

For create operations, generated services may fill relationship fields from `auth.userId` when the caller omits them. For update operations, generated services prevent changing relationship fields guarded by the operation.

Current modules use relationships such as:

- `api_key.user -> api_key.user_id`
- `ticket.user -> ticket.user_id`
- `transaction.user -> transaction.user_id`
- `comment.author -> comment.author_id`
- `issue.creator -> issue.creator_id`
- `issue.assignee -> issue.assignee_id`
- `project.owner -> project.owner_id`
- `user.self -> user.id`

## Guards

Authorization and guards are deliberately separate.

Authorization decides whether the caller is allowed to attempt the operation. Guards decide whether the record is in a valid business state for the operation.

For example, `ticket.confirm` may require:

- scope: `ticket.confirm`
- relationship: caller owns `ticket.user_id`
- guard: ticket status is currently `reserved`

Keeping those separate lets the same operation model serve REST, MCP, local services, and generated clients without mixing identity checks into business workflow predicates.

## Public Operations

`public = true` means the operation does not require an authenticated scope.
This is suitable for public catalog reads such as venues, artists, and performances.

Public does not mean "skip business logic"; custom operation guards still run after authorization.
