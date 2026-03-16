# Demo Guide

Interactive product demo for Duchy Opera — two-step flow from analysis to a live split-screen dashboard.

## Flow

### Step 1: Analyse
- Type `duchyopera.co.uk`, press Enter
- Modules and architecture animate in
- Click "Get Started" to continue

### Step 2: Dashboard
Split screen:
- **Left**: Live bookings feed with polling. Web bookings tagged `web`, MCP tagged `mcp`.
- **Right**: Booking UI. Shows list of upcoming performances; click one to open seat selection + checkout. After booking, returns to show list.
- **Hidden**: press Space to inject a `???` client booking into the feed (brain joke)

## Running

```bash
AUTH_ENABLED=false bun dev    # server on :3085
open demo/index.html          # in browser
```

## Demo Flow

1. Type `duchyopera.co.uk`, press Enter — architecture animates
2. Click "Get Started" — opens split-screen dashboard
3. On the right, click a show, pick seats, enter email, book
4. Booking appears in the live feed on the left
5. Use phone to book via MCP — appears with `mcp` tag
6. Press Space — brain booking appears with `???` tag

## MCP Booking (from phone)

Use an AI assistant connected to the MCP server to create a booking. The `client: "mcp"` field tags it in the feed.

## Backup

If server is down, the analysis animation still works. Booking and feed won't function without the server.
