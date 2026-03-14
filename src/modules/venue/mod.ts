import type { Module } from "../../core/module";
import {
  listVenues,
  getVenue,
  createVenue,
  updateVenue,
  deleteVenue,
} from "./handlers";

const schema = `
CREATE TABLE IF NOT EXISTS venue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postcode TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export function getModule(): Module {
  return {
    name: "venue",
    deps: [],
    schema,
    routes: [
      { method: "GET", path: "/api/venues", handler: listVenues },
      { method: "POST", path: "/api/venues", handler: createVenue },
      { method: "GET", path: "/api/venues/:id", handler: getVenue },
      { method: "PUT", path: "/api/venues/:id", handler: updateVenue },
      { method: "DELETE", path: "/api/venues/:id", handler: deleteVenue },
    ],
  };
}
