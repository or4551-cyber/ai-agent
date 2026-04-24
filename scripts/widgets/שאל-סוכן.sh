#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — ask agent via dialog (background task)
# Copy to ~/.shortcuts/tasks/
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
PORT="${AI_AGENT_PORT:-3002}"

INPUT=$(termux-dialog text -t "🤖 שאל את הסוכן" -i "מה תרצה לשאול?" 2>/dev/null)
QUESTION=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('text',''))" 2>/dev/null)

if [ -z "$QUESTION" ]; then
  exit 0
fi

termux-toast -g middle "⏳ חושב..."

RESP=$(curl -s -X POST "http://localhost:${PORT}/api/chat" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$QUESTION\"}" 2>/dev/null)

if [ -z "$RESP" ]; then
  termux-toast -b "#ff4444" -c white -g middle "⚠️ השרת לא פעיל"
  exit 1
fi

ANSWER=$(echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('response', d.get('message', str(d)))[:300])
" 2>/dev/null || echo "$RESP")

termux-notification \
  --title "🤖 $QUESTION" \
  --content "$ANSWER" \
  --id ai-ask \
  --priority high 2>/dev/null
