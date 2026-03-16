# Demo Guide

Interactive product demo for Duchy Opera — used alongside a separate slide deck (`slides.md`).

## What This Is

This is NOT a presentation. It's a live product demo that flows through 4 screens:

0. **Analysis** — Type `duchyopera.co.uk`, watch modules + architecture animate
1. **Web booking** — Select performance, seats, ticket type, checkout
2. **Live feed** — Bookings appear in real-time. Do MCP booking from phone here.
3. **Brain booking** — Copies feed from previous screen. Press space to fake a "brain booking".

No slide titles. The presenter narrates.

## Running

```bash
AUTH_ENABLED=false bun dev    # server on :3085
open demo/index.html          # in browser
```

## Navigation

- **Arrow keys**: jump between screens (always works, even in form fields)
- **Space**: respects in-screen gates (won't advance past analysis input until submitted)
- **Progress bar**: clickable segments at top

## Demo Flow

1. Click input, type `duchyopera.co.uk`, press Enter — architecture animates
2. Arrow right to booking — book some tickets via the web UI
3. Arrow right to feed — bookings appear. Use phone to book via MCP — appears with `MCP` tag
4. Arrow right to brain screen — pretend to concentrate, press space — booking appears

## MCP Booking (from phone)

Use an AI assistant connected to the MCP server to create a booking. The `client: "mcp"` field tags it in the feed.

## Backup

If server is down, the analysis animation still works. Booking and feed won't function without the server.
