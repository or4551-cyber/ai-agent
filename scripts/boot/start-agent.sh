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
  --title "AI Agent" \
  --content "השרת הופעל אוטומטית" \
  --id ai-boot \
  --priority low 2>/dev/null
