#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — battery check shortcut
# Copy to ~/.shortcuts/battery-check.sh
BAT=$(termux-battery-status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d['percentage']}% {'טוען' if d['status']=='CHARGING' else ''}\")" 2>/dev/null)
termux-toast "🔋 $BAT"
