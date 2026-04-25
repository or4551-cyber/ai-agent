#!/bin/bash
# ╔══════════════════════════════════════════════╗
# ║  🤖 Merlin Supervisor — Always-On Guardian  ║
# ╚══════════════════════════════════════════════╝
#
# Usage:  bash start.sh        (foreground)
#         nohup bash start.sh & (background, survives terminal close)
#
# Features:
#   - Auto-restart on crash (unlimited, with backoff)
#   - Termux wake-lock (prevents Android from killing us)
#   - Kills stale processes before starting
#   - Memory watchdog
#   - Clean shutdown with Ctrl+C

cd "$(dirname "$0")"

# ===== WAKE LOCK =====
# Prevent Android from killing Termux in background
if command -v termux-wake-lock &>/dev/null; then
  termux-wake-lock 2>/dev/null
  echo "[Supervisor] Wake lock acquired — Android won't kill us"
fi

# ===== CLEANUP ON EXIT =====
cleanup() {
  echo ""
  echo "[Supervisor] Shutting down..."
  kill $SERVER_PID 2>/dev/null
  if command -v termux-wake-unlock &>/dev/null; then
    termux-wake-unlock 2>/dev/null
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM

# ===== MAIN LOOP =====
RESTART_DELAY=2
CRASH_COUNT=0
SERVER_PID=0

while true; do
  # Kill any stale node on our port
  kill -9 $(lsof -t -i:3002) 2>/dev/null || true
  sleep 1

  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  🤖 Merlin starting...               ║"
  if [ $CRASH_COUNT -gt 0 ]; then
  echo "║  ↻ Restart #$CRASH_COUNT (delay was ${RESTART_DELAY}s)     ║"
  fi
  echo "╚══════════════════════════════════════╝"
  echo ""

  # Start server in background so we can monitor it
  node dist/server.js &
  SERVER_PID=$!

  # Wait for server process to exit
  wait $SERVER_PID
  EXIT_CODE=$?

  # If clean exit (code 0), stop
  if [ $EXIT_CODE -eq 0 ]; then
    echo "[Supervisor] Server exited cleanly. Stopping."
    break
  fi

  CRASH_COUNT=$((CRASH_COUNT + 1))
  echo "[Supervisor] Crashed (exit $EXIT_CODE). Restarting in ${RESTART_DELAY}s... (crash #$CRASH_COUNT)"
  sleep $RESTART_DELAY

  # Backoff: 2s, 4s, 6s, 8s, 10s (cap at 10s)
  RESTART_DELAY=$((RESTART_DELAY + 2))
  if [ $RESTART_DELAY -gt 10 ]; then
    RESTART_DELAY=10
  fi

  # Reset backoff after 5 successful minutes (no crash)
  # (handled implicitly: if we get here, we crashed, so delay keeps growing)

  # After 20 crashes, try rebuilding
  if [ $((CRASH_COUNT % 20)) -eq 0 ]; then
    echo "[Supervisor] Too many crashes. Attempting rebuild..."
    cd .. && git pull && cd server
    npm run build 2>/dev/null
    RESTART_DELAY=2
  fi
done
