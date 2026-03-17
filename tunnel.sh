#!/usr/bin/env bash
set -euo pipefail

# Start dev server (REST on :3085)
bun dev &
DEV_PID=$!

# Start MCP HTTP server (on :3086)
bun mcp:http &
MCP_PID=$!

trap "kill $DEV_PID $MCP_PID 2>/dev/null; exit" INT TERM

# Start cloudflared and capture the URL
cloudflared tunnel --url http://localhost:3086 2>&1 | while read -r line; do
  echo "$line" >&2
  if [[ "$line" =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
    URL="${BASH_REMATCH[0]}/mcp"
    echo "$URL" | pbcopy
    echo ""
    echo "✦ MCP endpoint copied to clipboard:"
    echo "  $URL"
    echo ""
  fi
done

wait
