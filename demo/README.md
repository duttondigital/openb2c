# Demo Guide

Tech startup event presentation for Duchy Opera.

## The Pitch

**One-liner:** "Build local. Interface universal."

**Core message:** Client-agnostic B2C systems that outlast technological shifts.

## Slide Flow (demo/index.html)

0. **OpenB2C** — Title slide
1. **The Problem** — Three failure cards, then → reveals solutions underneath
2. **The Solution** — Type `duchyopera.co.uk`, animated module graph + architecture diagram
3. **Web UI** — Live booking form (performance, seats, ticket type, checkout)
4. **AI Agent** — Live bookings feed (polls every 2s). Do MCP booking from phone here.
5. **Neural implant?** — Joke slide. Press space to fake a "brain booking" (copies feed from slide 4).
6. **The Economics** — Eventbrite vs self-hosted cost comparison
7. **Build Local. Interface Universal.** — Thesis
8. **Questions?** — End

Navigate: Arrow keys, spacebar, or click progress bar segments at top.

## Running the Demo

```bash
# Start server (auth disabled for demo)
AUTH_ENABLED=false bun dev
```

Server runs on http://localhost:3085

Open `demo/index.html` in browser.

## Live Demo Sequence

1. Walk through slides 0–2 (problem → solution)
2. On slide 2, type `duchyopera.co.uk` and press Enter — watch the architecture animate
3. Slide 3: Book tickets via the web UI
4. Slide 4: Show the booking appear in the live feed. Then use phone to book via MCP — it appears with `MCP` tag
5. Slide 5: Pretend to use brain, press space — booking appears (copied from feed)
6. Slides 6–8: Economics, thesis, questions

## MCP Booking (from phone)

Use an AI assistant connected to the MCP server to create a booking. The `client: "mcp"` field makes it appear with the MCP tag in the feed.

## Key Points to Hit

- **Not about the tech** — Don't mention Nix, Ed25519, codegen
- **About the pattern** — Backend-first, client-agnostic
- **Tangible benefit** — AI booking is the wow moment
- **Economics** — £5/month self-hosted vs 10% to Eventbrite
- **Local focus** — Built for Cornwall, not for the world

## Backup

If server issues:
- Can show architecture slide and explain conceptually
- The slide deck works standalone without the server
