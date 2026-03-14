import type { Module } from "../../core/module";
import {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  confirmTicket,
  cancelTicket,
} from "./handlers";

const schema = `
CREATE TABLE IF NOT EXISTS ticket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    performance_id INTEGER NOT NULL REFERENCES performance(id),
    customer_id INTEGER NOT NULL REFERENCES customer(id),
    seat TEXT,
    price_pence INTEGER NOT NULL,
    ticket_type TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'reserved',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export function getModule(): Module {
  return {
    name: "ticket",
    deps: ["customer", "performance"],
    schema,
    routes: [
      { method: "GET", path: "/api/tickets", handler: listTickets },
      { method: "POST", path: "/api/tickets", handler: createTicket },
      { method: "GET", path: "/api/tickets/:id", handler: getTicket },
      { method: "PUT", path: "/api/tickets/:id", handler: updateTicket },
      { method: "DELETE", path: "/api/tickets/:id", handler: deleteTicket },
      { method: "POST", path: "/api/tickets/:id/confirm", handler: confirmTicket },
      { method: "POST", path: "/api/tickets/:id/cancel", handler: cancelTicket },
    ],
  };
}
