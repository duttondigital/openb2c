#!/bin/sh

# Start Zola dev server in background
(cd ./example/ && zola serve --port 3070) &
ZOLA_PID=$!

# Start Odin API server
(cd ./example/ && odin run ../src/server -out=server.bin)

# Clean up Zola when Odin exits
kill $ZOLA_PID 2>/dev/null
