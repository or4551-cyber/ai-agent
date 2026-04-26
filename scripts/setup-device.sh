#!/bin/bash
# Merlin Multi-Device Setup Script
# Run this on each device (phone/tablet) to set up everything

set -e
cd ~/ai-agent 2>/dev/null || { echo "❌ ~/ai-agent not found. Run: git clone https://github.com/or4551-cyber/ai-agent.git ~/ai-agent"; exit 1; }

echo ""
echo "╔═══════════════════════════════════╗"
echo "║  🤖 Merlin Device Setup           ║"
echo "╚═══════════════════════════════════╝"
echo ""

# 1. Update code
echo "[1/5] Updating code..."
git pull 2>/dev/null || echo "  (skip git pull — no remote or offline)"

# 2. Install dependencies if needed
if [ ! -d "server/node_modules" ]; then
  echo "[2/5] Installing server dependencies..."
  cd server && npm install && cd ..
else
  echo "[2/5] Server dependencies OK"
fi

if [ ! -d "web/node_modules" ]; then
  echo "[3/5] Installing web dependencies..."
  cd web && npm install && cd ..
else
  echo "[3/5] Web dependencies OK"
fi

# 3. Setup .env if missing or incomplete
echo "[4/5] Checking .env..."
ENV_FILE="server/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp server/.env.example "$ENV_FILE"
  echo "  Created .env from example"
fi

# Check if ANTHROPIC_API_KEY is set
if grep -q "ANTHROPIC_API_KEY=sk-ant-xxxxx\|ANTHROPIC_API_KEY=CHANGE" "$ENV_FILE" 2>/dev/null || ! grep -q "ANTHROPIC_API_KEY=sk-" "$ENV_FILE" 2>/dev/null; then
  echo ""
  echo "  ⚠️  ANTHROPIC_API_KEY not configured!"
  echo "  Enter your Anthropic API key (starts with sk-ant-):"
  read -r API_KEY
  if [ -n "$API_KEY" ]; then
    # Remove old key line and add new one
    sed -i '/ANTHROPIC_API_KEY/d' "$ENV_FILE"
    echo "ANTHROPIC_API_KEY=$API_KEY" >> "$ENV_FILE"
    echo "  ✅ API key saved"
  fi
else
  echo "  ✅ API key already configured"
fi

# Ensure AUTH_TOKEN is dev-token for easy local use
sed -i '/^AUTH_TOKEN/d' "$ENV_FILE"
echo "AUTH_TOKEN=dev-token" >> "$ENV_FILE"

# 4. Build
echo "[5/5] Building..."
cd server && npm run build && cd ..
cd web && npm run build && cd ..

echo ""
echo "╔═══════════════════════════════════╗"
echo "║  ✅ Setup complete!               ║"
echo "║                                    ║"
echo "║  Start Merlin:                     ║"
echo "║    cd ~/ai-agent/server            ║"
echo "║    bash start.sh                   ║"
echo "╚═══════════════════════════════════╝"
echo ""
