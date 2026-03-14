import type { Module } from "../../core/module";
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  completeTransaction,
  refundTransaction,
} from "./handlers";

const schema = `
CREATE TABLE IF NOT EXISTS [transaction] (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customer(id),
    amount_pence INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reference TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaction_ticket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES [transaction](id),
    ticket_id INTEGER NOT NULL REFERENCES ticket(id)
);
`;

export function getModule(): Module {
  return {
    name: "transaction",
    deps: ["customer", "ticket"],
    schema,
    routes: [
      { method: "GET", path: "/api/transactions", handler: listTransactions },
      { method: "POST", path: "/api/transactions", handler: createTransaction },
      { method: "GET", path: "/api/transactions/:id", handler: getTransaction },
      { method: "PUT", path: "/api/transactions/:id", handler: updateTransaction },
      { method: "DELETE", path: "/api/transactions/:id", handler: deleteTransaction },
      { method: "POST", path: "/api/transactions/:id/complete", handler: completeTransaction },
      { method: "POST", path: "/api/transactions/:id/refund", handler: refundTransaction },
    ],
  };
}
