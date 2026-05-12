# Workflow Metadata

Workflow metadata describes how generated clients should present and explain business operations. It is co-located with the operation because the operation is the source of truth for the action.

Shared operation groups live at the system level:

```nix
workflows.groups.ticketLifecycle = {
  label = "Ticket lifecycle";
  description = "Customer and staff operations that move a ticket through admission.";
  displayPriority = 20;
};
```

Each operation can then attach workflow metadata:

```nix
operations.ticket.cancel = {
  workflow = {
    group = "ticketLifecycle";
    transitions = [{
      field = config.refs.ticket.status;
      from = [ "reserved" "confirmed" ];
      to = "cancelled";
    }];
    audit.summary = "Cancelled ticket";
    confirmation = {
      required = true;
      title = "Cancel ticket";
      message = "This will cancel the selected ticket.";
      confirmLabel = "Cancel ticket";
      severity = "warning";
    };
  };
};
```

Transitions use structured `config.refs.<entity>.<field>` values rather than string field references. Codegen validates that the transition field belongs to the operation entity and that the operation sets the field to the declared target value.

Generated OpenAPI exposes workflow metadata in two places:

- `x-openb2c-workflows` at the document level contains group definitions and an operation workflow index.
- `x-openb2c-workflow` on individual REST operations contains the group, transitions, audit text, and confirmation requirements for that endpoint.

Workflow metadata does not replace guards. Guards decide whether the current record state permits an operation at runtime. Workflow transitions describe the intended state movement so generated clients, documentation, and audit surfaces can present the operation correctly.
