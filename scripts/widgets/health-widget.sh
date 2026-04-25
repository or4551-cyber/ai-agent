#!/data/data/com.termux/files/usr/bin/bash
# Health Widget — shows heart rate + steps on Android home screen
# Place in ~/.shortcuts/ for Termux:Widget

TOKEN="${AUTH_TOKEN:-dev-token}"
API="http://localhost:3002/api/health"

# Fetch health data
DATA=$(curl -s -H "Authorization: Bearer $TOKEN" "$API" 2>/dev/null)

if [ -z "$DATA" ] || echo "$DATA" | grep -q '"error"'; then
  termux-toast -g middle "❌ שרת לא זמין"
  exit 1
fi

HR=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('currentHeartRate') or '—')" 2>/dev/null || echo "—")
STEPS=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('todaySteps') or '—')" 2>/dev/null || echo "—")
STRESS=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); s=d.get('stressLevel','unknown'); print({'low':'נמוך','medium':'בינוני','high':'גבוה'}.get(s,'—'))" 2>/dev/null || echo "—")

termux-toast -g middle "❤️ דופק: $HR  |  🚶 צעדים: $STEPS  |  🧠 לחץ: $STRESS"
