#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — morning briefing (background task)
# Copy to ~/.shortcuts/tasks/
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
PORT="${AI_AGENT_PORT:-3002}"

RESP=$(curl -s "http://localhost:${PORT}/api/briefing" \
  -H "Authorization: Bearer ${TOKEN}" 2>/dev/null)

if [ -z "$RESP" ]; then
  termux-toast -g middle "⚠️ השרת לא פעיל"
  exit 1
fi

# Parse with grep — no python3 dependency
GREET=$(echo "$RESP" | grep -o '"greeting": *"[^"]*"' | head -1 | sed 's/"greeting": *"//;s/"$//')
PCT=$(echo "$RESP" | grep -o '"percentage": *[0-9]*' | head -1 | grep -o '[0-9]*')
NOTIF=$(echo "$RESP" | grep -o '"unreadNotifications": *[0-9]*' | head -1 | grep -o '[0-9]*')
MEM=$(echo "$RESP" | grep -o '"memoryUsage": *[0-9]*' | head -1 | grep -o '[0-9]*')
TIP=$(echo "$RESP" | grep -o '"tip": *"[^"]*"' | head -1 | sed 's/"tip": *"//;s/"$//')
DATE=$(echo "$RESP" | grep -o '"date": *"[^"]*"' | head -1 | sed 's/"date": *"//;s/"$//')

[ -z "$GREET" ] && GREET="שלום"
[ -z "$PCT" ] && PCT="?"
[ -z "$NOTIF" ] && NOTIF="0"
[ -z "$MEM" ] && MEM="?"

CONTENT="🔋 ${PCT}%  📬 ${NOTIF} התראות  💾 ${MEM}% זיכרון"
[ -n "$TIP" ] && CONTENT="$CONTENT
💡 $TIP"

termux-notification \
  --title "🤖 $GREET — $DATE" \
  --content "$CONTENT" \
  --id ai-briefing \
  --priority high \
  --action "termux-open-url http://localhost:${PORT}/dashboard" 2>/dev/null
