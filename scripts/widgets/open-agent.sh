#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — open AI Agent in browser
# Copy to ~/.shortcuts/open-agent.sh
PORT="${AI_AGENT_PORT:-3002}"
termux-open-url "http://localhost:${PORT}"
