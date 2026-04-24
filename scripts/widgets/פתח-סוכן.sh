#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget — open AI Agent (background task)
# Copy to ~/.shortcuts/tasks/
PORT="${AI_AGENT_PORT:-3002}"
termux-open-url "http://localhost:${PORT}"
