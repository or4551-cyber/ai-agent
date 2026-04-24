#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — battery check (background task)
# Copy to ~/.shortcuts/tasks/
RAW=$(termux-battery-status 2>/dev/null)
PCT=$(echo "$RAW" | grep -o '"percentage": *[0-9]*' | grep -o '[0-9]*')
STATUS=$(echo "$RAW" | grep -o '"status": *"[A-Z]*"' | grep -o '"[A-Z]*"' | tr -d '"')

if [ -z "$PCT" ]; then
  termux-toast -g middle "⚠️ לא הצלחתי לקרוא סוללה"
  exit 1
fi

MSG="🔋 סוללה: ${PCT}%"
if [ "$STATUS" = "CHARGING" ]; then
  MSG="$MSG ⚡ טוען"
fi

termux-toast -g middle "$MSG"
