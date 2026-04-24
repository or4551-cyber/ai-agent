#!/data/data/com.termux/files/usr/bin/bash
# Termux:Tasker — send a question to the AI Agent
# Copy to ~/.termux/tasker/ask-agent.sh
# Usage from Tasker: Termux plugin → ask-agent.sh "מה מצב הסוללה?"

QUESTION="${1:-מה שלומך?}"
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
PORT="${AI_AGENT_PORT:-3002}"

RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/api/chat" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"${QUESTION}\"}" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  termux-toast "שגיאה: השרת לא מגיב"
  exit 1
fi

# Show response as notification
termux-notification \
  --title "AI Agent" \
  --content "$RESPONSE" \
  --id ai-tasker 2>/dev/null

# Also show as toast
termux-toast "$RESPONSE"
