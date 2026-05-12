# Audit Metadata

Audit metadata declares which entity and operation actions must be logged. It does not create the audit log table or write audit entries by itself; generated persistence for audit events is tracked separately in the REST API checklist.

Entity-level requirements declare the default audited operations:

```nix
audit.entities.ticket = {
  operations = [ "create" "update" "delete" "confirm" "cancel" ];
  category = "workflow";
  reason = "Tickets represent customer entitlements and admission state.";
};
```

Operation-level requirements sit beside the operation when a specific action needs a stronger or more specific audit reason:

```nix
operations.ticket.use.audit = {
  required = true;
  category = "workflow";
  reason = "Ticket admission must be traceable for venue operations.";
};
```

Supported categories are `data`, `workflow`, `security`, `payment`, and `system`.

Generated OpenAPI exposes audit metadata in two places:

- `x-openb2c-audit` at the document level contains entity declarations and the derived operation audit index.
- `x-openb2c-audit` on individual REST operations marks endpoints that require audit logging.

When both entity-level and operation-level metadata apply, the operation-level category and reason win.
