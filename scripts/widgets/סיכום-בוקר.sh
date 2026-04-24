#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — morning briefing (background task)
# Copy to ~/.shortcuts/tasks/
TOKEN="${AI_AGENT_TOKEN:-dev-token}"
PORT="${AI_AGENT_PORT:-3002}"

RESP=$(curl -s "http://localhost:${PORT}/api/briefing" \
  -H "Authorization: Bearer ${TOKEN}" 2>/dev/null)

if [ -z "$RESP" ]; then
  termux-toast -b "#ff4444" -c white -g middle "⚠️ השרת לא פעיל"
  exit 1
fi

BAT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('battery',{}); print(f\"🔋{b.get('percentage','?')}%\")" 2>/dev/null || echo "")
GREET=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('greeting','שלום'))" 2>/dev/null || echo "שלום")
NOTIF=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"📬{d.get('unreadNotifications',0)} התראות\")" 2>/dev/null || echo "")

termux-notification \
  --title "🤖 $GREET" \
  --content "$BAT  $NOTIF" \
  --id ai-briefing \
  --priority high 2>/dev/null
