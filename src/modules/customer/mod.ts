import type { Module } from "../../core/module";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "./handlers";

const schema = `
CREATE TABLE IF NOT EXISTS customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export function getModule(): Module {
  return {
    name: "customer",
    deps: [],
    schema,
    routes: [
      { method: "GET", path: "/api/customers", handler: listCustomers },
      { method: "POST", path: "/api/customers", handler: createCustomer },
      { method: "GET", path: "/api/customers/:id", handler: getCustomer },
      { method: "PUT", path: "/api/customers/:id", handler: updateCustomer },
      { method: "DELETE", path: "/api/customers/:id", handler: deleteCustomer },
    ],
  };
}
