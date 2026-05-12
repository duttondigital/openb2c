# Field Metadata

Field metadata lets each ontology column describe how generated outputs should present, validate, and protect that field. It belongs beside the field definition so SQL, TypeScript services, OpenAPI, MCP, and generated web clients all derive from the same source of truth.

```nix
tables.performance.title = {
  type = "text";
  required = true;
  metadata = {
    label = "Performance";
    helpText = "Public performance title.";
    placeholder = "The Magic Flute";
    displayPriority = 10;
  };
  validation = {
    maxLength = 160;
  };
};
```

## Metadata

- `label`: human-readable label for OpenAPI and generated UI.
- `helpText`: concise helper text for generated forms and API property descriptions.
- `placeholder`: generated input placeholder.
- `format`: semantic format such as `email`, `phone`, `postcode`, `date`, `time`, `date-time`, `url`, `money`, or `textarea`.
- `displayPriority`: lower numbers appear earlier in generated forms, lists, and detail views.
- `privacy`: one of `public`, `internal`, `sensitive`, or `secret`.
- `redact`: removes the field from generated REST responses.

## Validation

Per-field validation metadata currently supports:

- `minLength` and `maxLength` for strings.
- `minimum` and `maximum` for numeric fields.
- `pattern` for JavaScript-compatible regular expressions.
- `enum` for finite allowed values.

Generated OpenAPI schemas expose these constraints, generated forms use them for native browser validation where possible, and generated services enforce them before writes. Cross-field constraints are intentionally not modeled here; those need table or workflow-level validation because they depend on more than one column.
