#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — Toggle Merlin Voice Daemon
# Copy to ~/.shortcuts/tasks/
PORT="${AI_AGENT_PORT:-3002}"
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
API="http://localhost:${PORT}/api/voice-daemon"
AUTH="Authorization: Bearer ${TOKEN}"

# Check current status
STATUS=$(curl -s "${API}/status" -H "${AUTH}" 2>/dev/null)
ACTIVE=$(echo "$STATUS" | grep -o '"active":true')

if [ -n "$ACTIVE" ]; then
  # Daemon is running — stop it
  curl -s -X POST "${API}/stop" -H "${AUTH}" > /dev/null
  termux-toast "🔇 Merlin Voice כבוי"
else
  # Daemon is off — start in wake word mode
  curl -s -X POST "${API}/start" -H "${AUTH}" -H "Content-Type: application/json" -d '{"mode":"wake_word"}' > /dev/null
  termux-toast "👂 Merlin Voice — אמור 'היי מרלין'"
fi
