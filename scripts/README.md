# Scripts — Termux Plugins

## Setup

### Termux:Boot (auto-start)
```bash
mkdir -p ~/.termux/boot
cp scripts/boot/start-agent.sh ~/.termux/boot/
chmod +x ~/.termux/boot/start-agent.sh
```

### Termux:Tasker (automation)
```bash
mkdir -p ~/.termux/tasker
cp scripts/tasker/*.sh ~/.termux/tasker/
chmod +x ~/.termux/tasker/*.sh
```

### Termux:Widget (home screen shortcuts)
```bash
mkdir -p ~/.shortcuts
cp scripts/widgets/*.sh ~/.shortcuts/
chmod +x ~/.shortcuts/*.sh
```

## Required Plugins
Install from F-Droid (same repo as Termux):
- **Termux:Boot** — auto-start on device boot
- **Termux:Tasker** — Tasker integration
- **Termux:Widget** — home screen shortcuts
