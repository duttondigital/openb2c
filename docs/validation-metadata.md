# Validation Metadata

Validation metadata is split by scope.

Field-level rules live beside the field:

```nix
tables.performance.title.validation = {
  minLength = 1;
  maxLength = 160;
  pattern = "^[^<>]+$";
};
```

Supported field rules are `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, and `enum`. Generated OpenAPI schemas expose them directly, generated forms use the browser-native equivalents where possible, and generated services enforce them before writes.

Cross-field constraints live under `validations.<entity>` because they describe a whole record rather than a single column:

```nix
validations.ticket.vipPriceMinimum = {
  fields = [
    config.refs.ticket.ticket_type
    config.refs.ticket.price_pence
  ];
  expression = E.or
    (E.ne (E.f "ticket_type") (E.lit "vip"))
    (E.gte (E.f "price_pence") (E.lit 2500));
  message = "VIP tickets must cost at least GBP 25.00.";
};
```

Cross-field constraints use the same local expression AST as operation guards, but they are intentionally limited to fields on the current record. Codegen validates that each expression field is declared in `fields`, and generated services evaluate the constraint against the proposed record on create and against the merged existing-plus-input record on update.

Generated OpenAPI includes cross-field constraints under `x-openb2c-validation.crossFieldConstraints` so clients and documentation can explain constraints that JSON Schema cannot express cleanly.
