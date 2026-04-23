#!/bin/bash
# ===========================================
#  AI Agent — Phone Installation Script
#  Run this inside Termux on your Android phone
# ===========================================

set -e

echo "🤖 AI Agent — Installing..."
echo ""

# 1. Update packages
echo "📦 Updating packages..."
pkg update -y && pkg upgrade -y

# 2. Install dependencies
echo "📦 Installing Node.js, Git, and tools..."
pkg install -y nodejs-lts git openssh termux-api

# 3. Grant storage access
echo "📁 Requesting storage access..."
termux-setup-storage

# 4. Clone or copy the project
# If you transferred the project folder to the phone:
PROJECT_DIR="$HOME/ai-agent"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "📂 Creating project directory..."
  mkdir -p "$PROJECT_DIR"
  echo "⚠️  Copy the project files to $PROJECT_DIR"
  echo "    You can use: scp, USB file transfer, or git clone"
  echo ""
  echo "    Option A — Transfer from PC via USB:"
  echo "    Copy the 'phone agent' folder to your phone's storage"
  echo "    Then run: cp -r /storage/emulated/0/phone-agent/* $PROJECT_DIR/"
  echo ""
  echo "    Option B — Git clone (if you pushed to GitHub):"
  echo "    git clone https://github.com/YOUR_USER/ai-agent.git $PROJECT_DIR"
  echo ""
  exit 0
fi

# 5. Install server dependencies
echo "📦 Installing server dependencies..."
cd "$PROJECT_DIR/server"
npm install

# 6. Setup .env file
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  Edit your .env file:"
  echo "    nano $PROJECT_DIR/server/.env"
  echo "    Set your ANTHROPIC_API_KEY"
  echo ""
fi

# 7. Install web dependencies & build
echo "📦 Installing frontend dependencies..."
cd "$PROJECT_DIR/web"
npm install
npm run build

# 8. Done!
echo ""
echo "✅ Installation complete!"
echo ""
echo "To start the agent:"
echo "  cd $PROJECT_DIR/server"
echo "  npm run dev"
echo ""
echo "Then open Chrome on your phone:"
echo "  http://localhost:3002"
echo ""
