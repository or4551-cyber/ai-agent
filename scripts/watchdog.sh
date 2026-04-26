#!/bin/bash
# Merlin Watchdog — monitors and auto-restarts the server
# Usage: nohup bash ~/ai-agent/scripts/watchdog.sh &

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")/server"
LOG_DIR="$HOME/.ai-agent/logs"
WATCHDOG_LOG="$LOG_DIR/watchdog.log"
PID_FILE="$HOME/.ai-agent/merlin.pid"
HEALTH_URL="http://localhost:3002/api/health"
SHIELD_URL="http://localhost:3002/api/shield-health?token=dev-token"
MAX_RESTARTS=10
RESTART_COUNT=0
CHECK_INTERVAL=30  # seconds
RESTART_COOLDOWN=15  # seconds between restarts

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$WATCHDOG_LOG"
  echo "[Watchdog] $1"
}

is_server_alive() {
  # Check 1: PID file
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # Check 2: HTTP health check
      local http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null)
      if [ "$http_code" = "200" ] || [ "$http_code" = "401" ]; then
        return 0  # Alive
      fi
      log "PID $pid exists but HTTP returned $http_code"
      return 1
    fi
  fi

  # Check 3: check if port is being used
  local port_check=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:3002/" 2>/dev/null)
  if [ "$port_check" = "200" ] || [ "$port_check" = "401" ]; then
    return 0  # Alive but no PID file
  fi

  return 1  # Dead
}

start_server() {
  log "Starting Merlin server..."
  cd "$SERVER_DIR" || { log "ERROR: Server directory not found: $SERVER_DIR"; return 1; }

  # Ensure wake lock is held
  termux-wake-lock 2>/dev/null

  # Start with --expose-gc for memory management
  nohup node --expose-gc --max-old-space-size=512 dist/server.js >> "$LOG_DIR/server.log" 2>&1 &
  local new_pid=$!

  # Wait a moment for startup
  sleep 3

  if kill -0 "$new_pid" 2>/dev/null; then
    log "Server started with PID $new_pid"
    RESTART_COUNT=$((RESTART_COUNT + 1))
    return 0
  else
    log "ERROR: Server failed to start"
    return 1
  fi
}

check_memory() {
  # Check shield health for memory warnings
  local shield=$(curl -s --max-time 5 "$SHIELD_URL" 2>/dev/null)
  if [ -n "$shield" ]; then
    local mem_level=$(echo "$shield" | grep -o '"level":"[^"]*"' | head -1 | sed 's/"level":"//;s/"//')
    if [ "$mem_level" = "critical" ]; then
      log "WARNING: Memory critical! Consider restarting..."
    fi
  fi
}

# ===== MAIN LOOP =====
log "Watchdog started. Monitoring Merlin server..."
log "Server dir: $SERVER_DIR"
log "Check interval: ${CHECK_INTERVAL}s"

# Hold wake lock
termux-wake-lock 2>/dev/null

while true; do
  if is_server_alive; then
    # Server is running — periodic health check
    check_memory
    RESTART_COUNT=0  # Reset counter when server is stable
  else
    log "Server is DOWN!"

    if [ "$RESTART_COUNT" -ge "$MAX_RESTARTS" ]; then
      log "FATAL: Max restarts ($MAX_RESTARTS) exceeded. Waiting 5 minutes before trying again..."
      sleep 300
      RESTART_COUNT=0
    fi

    sleep "$RESTART_COOLDOWN"
    start_server
  fi

  sleep "$CHECK_INTERVAL"
done
