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

Relationships are declared from structured field refs, not string paths:

```nix
relationships.ticket.owner.field = config.refs.ticket.user_id;

operations.ticket =
  let rel = config.relationships.ticket;
  in {
    read.relationships = with rel; [ owner ];
    create.relationships = with rel; [ owner ];
    update.relationships = with rel; [ owner ];

    confirm = {
      relationships = with rel; [ owner ];
      guard = E.eq (E.f "status") (E.lit "reserved");
      set = { status = "confirmed"; };
    };
  };
```

For create operations, generated services may fill relationship fields from `auth.userId` when the caller omits them. For update operations, generated services prevent changing relationship fields guarded by the operation.

Current modules use relationships such as:

- `api_key.owner -> api_key.user_id`
- `ticket.owner -> ticket.user_id`
- `transaction.owner -> transaction.user_id`
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
