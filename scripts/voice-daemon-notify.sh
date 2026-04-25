#!/data/data/com.termux/files/usr/bin/bash
# Merlin Voice Daemon — Notification Control
# Shows a persistent notification with voice daemon controls

PORT="${AI_AGENT_PORT:-3002}"
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
API="http://localhost:${PORT}/api/voice-daemon"
AUTH="Authorization: Bearer ${TOKEN}"

case "$1" in
  start)
    curl -s -X POST "${API}/start" -H "${AUTH}" -H "Content-Type: application/json" -d '{"mode":"wake_word"}' > /dev/null
    ;;
  start-active)
    curl -s -X POST "${API}/start" -H "${AUTH}" -H "Content-Type: application/json" -d '{"mode":"active"}' > /dev/null
    ;;
  activate)
    curl -s -X POST "${API}/activate" -H "${AUTH}" > /dev/null
    ;;
  stop)
    curl -s -X POST "${API}/stop" -H "${AUTH}" > /dev/null
    ;;
  status)
    curl -s "${API}/status" -H "${AUTH}"
    ;;
  *)
    echo "Usage: $0 {start|start-active|activate|stop|status}"
    echo ""
    echo "  start         - Start daemon in wake word mode"
    echo "  start-active  - Start daemon in active (live) mode"
    echo "  activate      - Switch running daemon to active mode"
    echo "  stop          - Stop daemon"
    echo "  status        - Show daemon status"
    ;;
esac
