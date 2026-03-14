# Demo Guide

Tech startup event presentation for Duchy Opera.

## The Pitch

**One-liner:** "Build local. Interface universal."

**Core message:** Client-agnostic B2C systems that outlast technological shifts.

## Three Failures of Global Platforms

1. **One-Size-Fits-All** - Blanket solutions ignore local context (seasonal pricing, Cornwall's tourist economy)
2. **One Client Fits All** - Not everyone interacts the same way (screen readers, AI assistants, voice)
3. **Built For Today** - Client-specific systems break when paradigms shift

## The Solution

- **Local problems → local solutions** (targeted, not blanket)
- **Any client, all equal** (web, mobile, AI, accessibility tools)
- **Backend-first** (build once, clients come and go)

## Demo Flow

### Part 1: Slides (demo/index.html)

Animated presentation covering:
- The three failures
- The solution
- Case study: Duchy Opera
- Architecture diagram

Navigate: Arrow keys or spacebar

### Part 2: Live Booking (demo/booking.html)

Split screen:
- **Left:** Live bookings feed (polls every 2 seconds)
- **Right:** Minimal booking form

**Demo sequence:**
1. Start with empty feed
2. Book via web form → appears with `WEB` tag
3. Book via MCP from another device → appears with `MCP` tag
4. Point: "Same backend. Different clients. Nothing changed."

## Running the Demo

```bash
# Terminal 1: Start server
bun dev

# Terminal 2: Open demo
open demo/booking.html
```

Server runs on http://localhost:3085

## MCP Booking

From another device/agent, create a transaction with:

```json
{
  "customer_id": 1,
  "amount_pence": 5000,
  "type": "purchase",
  "client": "mcp"
}
```

The `client: "mcp"` field makes it appear with the green MCP tag in the feed.

## Key Points to Hit

- **Not about the tech** - Don't mention Nix, Ed25519, codegen
- **About the pattern** - Backend-first, client-agnostic
- **Tangible benefit** - AI booking is the wow moment
- **Economics** - £5/month self-hosted vs 10% to Eventbrite
- **Local focus** - Built for Cornwall, not for the world

## Backup

If server issues:
- The booking form simulates success after 1s delay
- Can show architecture slide and explain conceptually

## Files

- `demo/index.html` - Full slide presentation
- `demo/booking.html` - Live booking demo only
- `slides.md` - Markdown source (for `slides` CLI)
