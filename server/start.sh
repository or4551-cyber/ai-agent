#!/bin/bash
# Auto-restart wrapper for Merlin server
# Usage: bash start.sh (or: nohup bash start.sh &)

cd "$(dirname "$0")"

MAX_RESTARTS=10
RESTART_DELAY=3
restart_count=0

while [ $restart_count -lt $MAX_RESTARTS ]; do
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  🤖 Starting Merlin (attempt $((restart_count + 1)))     ║"
  echo "╚══════════════════════════════════════╝"
  echo ""

  # Kill any existing node processes on our port
  kill -9 $(lsof -t -i:3002) 2>/dev/null || true
  sleep 1

  # Run server
  node dist/server.js
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[Merlin] Server exited cleanly."
    break
  fi

  restart_count=$((restart_count + 1))
  echo "[Merlin] Crashed with exit code $EXIT_CODE. Restarting in ${RESTART_DELAY}s... ($restart_count/$MAX_RESTARTS)"
  sleep $RESTART_DELAY

  # Increase delay with each crash (backoff)
  RESTART_DELAY=$((RESTART_DELAY + 2))
done

if [ $restart_count -ge $MAX_RESTARTS ]; then
  echo "[Merlin] Too many crashes ($MAX_RESTARTS). Stopping."
fi
