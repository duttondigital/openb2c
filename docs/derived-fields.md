# Derived Fields

Derived fields are display-only values computed from stored entity fields. They are declared outside `tables` so they do not become database columns and are never accepted in create or update inputs.

```nix
derived.performance.display_title = {
  type = "text";
  metadata = {
    label = "Display title";
    displayPriority = 15;
  };
  dependencies = [
    config.refs.performance.title
    config.refs.performance.date
    config.refs.performance.time
  ];
  template = "{title} - {date} {time}";
};
```

Generated row types and response schemas include derived fields. Generated input types and OpenAPI input schemas exclude them. Generated services compute derived values after reading rows from SQLite, so REST list and detail responses contain the display-only values without storing redundant data.

Derived fields can use either:

- `template`: a string with `{field_name}` placeholders.
- `expression`: a local expression AST for computed numeric or boolean values.

Dependencies use structured `config.refs.<entity>.<field>` references. Codegen validates that templates and expressions only use declared local dependencies and that derived field names do not collide with stored columns.
