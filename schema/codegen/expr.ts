import type { Expr } from "./types";

export function compileExpr(expr: Expr, ctx: string): string {
  switch (expr._t) {
    case "field":
      return `${ctx}.${expr.name}`;

    case "rel":
      // Related entity field - generates variable reference
      // The service will need to load this relation
      return `_rel_${expr.entity}.${expr.field}`;

    case "lit":
      const val = expr.value;
      if (typeof val === "string") return JSON.stringify(val);
      if (typeof val === "boolean") return val ? "true" : "false";
      return String(val);

    case "bin":
      const left = compileExpr(expr.left as Expr, ctx);
      const right = compileExpr(expr.right as Expr, ctx);
      const op = expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
      return `(${left} ${op} ${right})`;

    case "un":
      const arg = compileExpr(expr.arg as Expr, ctx);
      if (expr.op === "isNull") return `(${arg} === null)`;
      if (expr.op === "notNull") return `(${arg} !== null)`;
      return `${expr.op}(${arg})`;

    case "agg":
      // Aggregations need special handling
      return `/* AGG: ${expr.op} on ${(expr.rel as Expr).entity} */`;

    default:
      return "/* unknown expr */";
  }
}

// Extract relations used in an expression
export function extractRelations(expr: Expr | null): string[] {
  if (!expr) return [];
  const rels: string[] = [];

  function walk(e: Expr) {
    if (e._t === "rel") {
      rels.push(e.entity as string);
    } else if (e._t === "bin") {
      walk(e.left as Expr);
      walk(e.right as Expr);
    } else if (e._t === "un") {
      walk(e.arg as Expr);
    }
  }

  walk(expr);
  return [...new Set(rels)];
}
