# Role And Policy Metadata

OpenB2C authorization is still enforced by scopes and record relationships. Role metadata describes intended identity audiences for generated documentation and clients; it is not added to `AuthContext` and generated services do not branch on roles.

The platform provides four default role metadata entries:

- `customer`: authenticated customer self-service identity.
- `staff`: authenticated staff/operator identity.
- `service`: user-bound API key or integration identity.
- `system`: trusted local/system execution with the explicit `*` scope.

Operation policy metadata sits beside the operation:

```nix
operations.ticket.confirm = {
  policy = {
    label = "Confirm ticket";
    description = "Customer or user-bound service confirms a reserved ticket.";
    audiences = [ "customer" "service" ];
    risk = "medium";
  };
  guard = E.eq (E.f "status") (E.lit "reserved");
};
```

When `audiences` is omitted, codegen derives it from the enforced policy:

- public operations: `anonymous`, `customer`, `staff`, and `service`
- relationship-scoped operations: `customer`
- protected global operations: `staff` and `service`

Generated OpenAPI includes `x-openb2c-auth` at the document level and `x-openb2c-policy` on generated REST operations. These extensions are metadata for clients, docs, and future UI behavior. Runtime authorization remains the same scope-plus-relationship check documented in [Authentication And Authorization Principles](./auth-and-authorization.md).
