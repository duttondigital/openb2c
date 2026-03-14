import type { Module } from "../../core/module";
import {
  listArtists,
  getArtist,
  createArtist,
  updateArtist,
  deleteArtist,
} from "./handlers";

const schema = `
CREATE TABLE IF NOT EXISTS artist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    bio TEXT,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export function getModule(): Module {
  return {
    name: "artist",
    deps: [],
    schema,
    routes: [
      { method: "GET", path: "/api/artists", handler: listArtists },
      { method: "POST", path: "/api/artists", handler: createArtist },
      { method: "GET", path: "/api/artists/:id", handler: getArtist },
      { method: "PUT", path: "/api/artists/:id", handler: updateArtist },
      { method: "DELETE", path: "/api/artists/:id", handler: deleteArtist },
    ],
  };
}
