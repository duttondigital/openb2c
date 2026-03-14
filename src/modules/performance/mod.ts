import type { Module } from "../../core/module";
import {
  listPerformances,
  getPerformance,
  createPerformance,
  updatePerformance,
  deletePerformance,
  addArtistToPerformance,
  removeArtistFromPerformance,
} from "./handlers";

const schema = `
CREATE TABLE IF NOT EXISTS performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    venue_id INTEGER NOT NULL REFERENCES venue(id),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration_mins INTEGER NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_artist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    performance_id INTEGER NOT NULL REFERENCES performance(id),
    artist_id INTEGER NOT NULL REFERENCES artist(id),
    role_in_performance TEXT
);
`;

export function getModule(): Module {
  return {
    name: "performance",
    deps: ["venue", "artist"],
    schema,
    routes: [
      { method: "GET", path: "/api/performances", handler: listPerformances },
      { method: "POST", path: "/api/performances", handler: createPerformance },
      { method: "GET", path: "/api/performances/:id", handler: getPerformance },
      { method: "PUT", path: "/api/performances/:id", handler: updatePerformance },
      { method: "DELETE", path: "/api/performances/:id", handler: deletePerformance },
      { method: "POST", path: "/api/performances/:id/artists", handler: addArtistToPerformance },
      { method: "DELETE", path: "/api/performances/:id/artists/:artistId", handler: removeArtistFromPerformance },
    ],
  };
}
