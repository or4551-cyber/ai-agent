#!/data/data/com.termux/files/usr/bin/bash
# Termux:Tasker — trigger morning briefing
# Copy to ~/.termux/tasker/morning-briefing.sh
# Set Tasker profile: Time 07:00 → Termux plugin → morning-briefing.sh

TOKEN="${AI_AGENT_TOKEN:-dev-token}"
PORT="${AI_AGENT_PORT:-3002}"

BRIEFING=$(curl -s "http://localhost:${PORT}/api/briefing" \
  -H "Authorization: Bearer ${TOKEN}" 2>/dev/null)

if [ -z "$BRIEFING" ]; then
  termux-notification \
    --title "סיכום בוקר" \
    --content "השרת לא מגיב. הפעל אותו ידנית." \
    --id ai-morning 2>/dev/null
  exit 1
fi

# Extract key info
BATTERY=$(echo "$BRIEFING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"🔋 {d.get('battery',{}).get('percentage','?')}%\")" 2>/dev/null || echo "")
GREETING=$(echo "$BRIEFING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('greeting','בוקר טוב'))" 2>/dev/null || echo "בוקר טוב")

termux-notification \
  --title "$GREETING" \
  --content "${BATTERY}" \
  --id ai-morning \
  --priority high \
  --action "termux-open-url http://localhost:${PORT}" 2>/dev/null

# Also speak it
termux-tts-speak -l he "$GREETING. $BATTERY" 2>/dev/null &
