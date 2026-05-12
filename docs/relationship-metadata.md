# Relationship Metadata

OpenB2C keeps database relationships and authorization relationships separate.

Database relationships are declared on foreign-key columns with `references`. Optional `relationship` metadata describes how generated clients and API contracts should present that link.

```nix
tables.ticket.performance_id = {
  type = "integer";
  required = true;
  references = "performance(id)";
  relationship = {
    label = "Performance";
    description = "Performance this ticket admits the customer to.";
    targetLabel = config.refs.performance.title;
  };
};
```

Generated OpenAPI properties receive an `x-openb2c-relationship` extension with the target entity, target field, label, description, cardinality, and optional target label field. Generated admin forms use that metadata for relationship selectors instead of guessing from `_id` names.

Authorization relationships still live under operation policy and answer a different question: whether `auth.userId` is allowed to act on a specific record. Those relationships may be resolved by convention, such as `user_id`, or declared explicitly under `relationships.<entity>.<name>.field`.
