#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot — auto-start AI Agent server on device boot
# Copy this file to ~/.termux/boot/start-agent.sh

# Wait for network
sleep 10

# Kill any existing instance
pkill -f "node.*server" 2>/dev/null

# Navigate to project
cd ~/ai-agent/server || exit 1

# Start server in background with logging
export NODE_ENV=production
nohup node dist/server.js > ~/.ai-agent/server.log 2>&1 &

# Notify user
termux-notification \
  --title "Merlin Agent" \
  --content "השרת הופעל אוטומטית" \
  --id ai-boot \
  --priority low 2>/dev/null

# Start voice daemon notification (with action buttons)
sleep 5
PORT="${AI_AGENT_PORT:-3002}"
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
API="http://localhost:${PORT}/api/voice-daemon"
AUTH="Authorization: Bearer ${TOKEN}"

termux-notification \
  --title "Merlin Voice" \
  --content "לחץ להפעלת מצב קולי" \
  --id merlin-voice \
  --priority low \
  --button1 "🎙️ Live" \
  --button1-action "curl -s -X POST ${API}/start -H '${AUTH}' -H 'Content-Type: application/json' -d '{\"mode\":\"active\"}' > /dev/null" \
  --button2 "👂 Wake Word" \
  --button2-action "curl -s -X POST ${API}/start -H '${AUTH}' -H 'Content-Type: application/json' -d '{\"mode\":\"wake_word\"}' > /dev/null" \
  2>/dev/null

# Auto-start if configured
if [ "${AUTO_VOICE_DAEMON}" = "true" ]; then
  curl -s -X POST "${API}/start" -H "${AUTH}" -H "Content-Type: application/json" -d '{"mode":"wake_word"}' > /dev/null
fi
