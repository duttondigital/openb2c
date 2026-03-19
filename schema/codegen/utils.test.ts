import { describe, expect, test } from "bun:test";
import { pascalCase } from "./utils";

describe("pascalCase", () => {
  test("converts snake_case to PascalCase", () => {
    expect(pascalCase("customer")).toBe("Customer");
    expect(pascalCase("order_item")).toBe("OrderItem");
    expect(pascalCase("created_at")).toBe("CreatedAt");
  });

  test("handles multiple underscores", () => {
    expect(pascalCase("order_line_item")).toBe("OrderLineItem");
    expect(pascalCase("a_b_c_d")).toBe("ABCD");
  });

  test("handles already capitalized", () => {
    expect(pascalCase("Customer")).toBe("Customer");
  });

  test("handles empty string", () => {
    expect(pascalCase("")).toBe("");
  });

  test("handles single character", () => {
    expect(pascalCase("a")).toBe("A");
  });

  test("handles numbers", () => {
    expect(pascalCase("order_2")).toBe("Order2");
    expect(pascalCase("v2_api")).toBe("V2Api");
  });
});
