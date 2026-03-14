# Expression AST builders
# Usage: E.eq (E.f "status") (E.lit "pending")
# Exports to JSON AST that codegen compiles to target language

{
  # Field reference (local entity)
  f = name: { _t = "field"; inherit name; };
  field = name: { _t = "field"; inherit name; };

  # Related entity field (via FK)
  rel = entity: field: { _t = "rel"; inherit entity field; };

  # Related entity through junction table
  relVia = entity: via: field: { _t = "rel"; inherit entity via field; };

  # Literal value
  lit = value: { _t = "lit"; inherit value; };

  # Comparison operators
  eq = left: right: { _t = "bin"; op = "=="; inherit left right; };
  ne = left: right: { _t = "bin"; op = "!="; inherit left right; };
  lt = left: right: { _t = "bin"; op = "<"; inherit left right; };
  lte = left: right: { _t = "bin"; op = "<="; inherit left right; };
  gt = left: right: { _t = "bin"; op = ">"; inherit left right; };
  gte = left: right: { _t = "bin"; op = ">="; inherit left right; };

  # Boolean operators
  and = left: right: { _t = "bin"; op = "&&"; inherit left right; };
  or = left: right: { _t = "bin"; op = "||"; inherit left right; };
  not = arg: { _t = "un"; op = "!"; inherit arg; };

  # Null checks
  isNull = arg: { _t = "un"; op = "isNull"; inherit arg; };
  notNull = arg: { _t = "un"; op = "notNull"; inherit arg; };

  # Arithmetic
  add = left: right: { _t = "bin"; op = "+"; inherit left right; };
  sub = left: right: { _t = "bin"; op = "-"; inherit left right; };
  mul = left: right: { _t = "bin"; op = "*"; inherit left right; };
  div = left: right: { _t = "bin"; op = "/"; inherit left right; };

  # Aggregations on related collections
  count = rel: { _t = "agg"; op = "count"; inherit rel; };
  sum = rel: field: { _t = "agg"; op = "sum"; inherit rel field; };
  any = rel: pred: { _t = "agg"; op = "any"; inherit rel pred; };
  all = rel: pred: { _t = "agg"; op = "all"; inherit rel pred; };

  # Convenience: always true/false
  true_ = { _t = "lit"; value = true; };
  false_ = { _t = "lit"; value = false; };
}
