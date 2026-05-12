import { fieldDisplayLabel } from "./format";

export type OperationAvailability = {
  available: boolean;
  reason: string;
};

export function displayOperation(op: string): string {
  return op.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function operationAvailability(record: Record<string, unknown>, workflow: any, label: string): OperationAvailability {
  const transitions = workflow?.transitions || [];
  for (const transition of transitions) {
    const field = transition?.field?.field;
    if (!field) continue;
    const current = record[field];
    const from = transition.from || [];
    if (from.length > 0 && !from.map(String).includes(String(current))) {
      return {
        available: false,
        reason: `${label} is unavailable while ${fieldDisplayLabel(field)} is ${String(current || "unset")}.`,
      };
    }
  }
  const precondition = evaluatePrecondition(record, workflow?.preconditions?.expression);
  if (precondition === false) {
    return {
      available: false,
      reason: `${label} is unavailable for this record.`,
    };
  }
  return { available: true, reason: "" };
}

function evaluatePrecondition(record: Record<string, unknown>, expr: any): boolean | null {
  if (!expr) return true;
  if (expr._t === "lit") return Boolean(expr.value);
  if (expr._t === "field") {
    const value = guardValue(record, expr);
    return value.known ? Boolean(value.value) : null;
  }
  if (expr._t === "bin") {
    const op = String(expr.op || "");
    if (op === "&&") return booleanAnd(evaluatePrecondition(record, expr.left), evaluatePrecondition(record, expr.right));
    if (op === "||") return booleanOr(evaluatePrecondition(record, expr.left), evaluatePrecondition(record, expr.right));

    const left = guardValue(record, expr.left);
    const right = guardValue(record, expr.right);
    if (!left.known || !right.known) return null;
    switch (op) {
      case "==": return left.value === right.value;
      case "!=": return left.value !== right.value;
      case "<": return Number(left.value) < Number(right.value);
      case "<=": return Number(left.value) <= Number(right.value);
      case ">": return Number(left.value) > Number(right.value);
      case ">=": return Number(left.value) >= Number(right.value);
      default: return null;
    }
  }
  if (expr._t === "un") {
    if (expr.op === "!") {
      const value = evaluatePrecondition(record, expr.arg);
      return value === null ? null : !value;
    }
    const value = guardValue(record, expr.arg);
    if (!value.known) return null;
    if (expr.op === "isNull") return value.value === null;
    if (expr.op === "notNull") return value.value !== null;
  }
  return null;
}

function guardValue(record: Record<string, unknown>, expr: any): { known: boolean; value?: unknown } {
  if (!expr) return { known: false };
  if (expr._t === "lit") return { known: true, value: expr.value };
  if (expr._t === "field") {
    const name = String(expr.name || "");
    if (!Object.prototype.hasOwnProperty.call(record, name)) return { known: false };
    return { known: true, value: record[name] };
  }
  const booleanValue = evaluatePrecondition(record, expr);
  return booleanValue === null ? { known: false } : { known: true, value: booleanValue };
}

function booleanAnd(left: boolean | null, right: boolean | null): boolean | null {
  if (left === false || right === false) return false;
  if (left === true && right === true) return true;
  return null;
}

function booleanOr(left: boolean | null, right: boolean | null): boolean | null {
  if (left === true || right === true) return true;
  if (left === false && right === false) return false;
  return null;
}
