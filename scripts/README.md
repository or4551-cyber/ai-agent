# Scripts — Termux Plugins

## Setup

### Termux:Boot (auto-start)
```bash
mkdir -p ~/.termux/boot
cp ~/ai-agent/scripts/boot/start-agent.sh ~/.termux/boot/
chmod +x ~/.termux/boot/start-agent.sh
```

### Termux:Tasker (automation)
```bash
mkdir -p ~/.termux/tasker
cp ~/ai-agent/scripts/tasker/*.sh ~/.termux/tasker/
chmod +x ~/.termux/tasker/*.sh
```

### Termux:Widget (home screen shortcuts)
Scripts must go in `~/.shortcuts/tasks/` (NOT `~/.shortcuts/`) so they run in the **background** without opening a terminal.
```bash
mkdir -p ~/.shortcuts/tasks
cp ~/ai-agent/scripts/widgets/*.sh ~/.shortcuts/tasks/
chmod +x ~/.shortcuts/tasks/*.sh
```

Available shortcuts:
- **פתח-סוכן** — opens the agent in browser
- **בדוק-סוללה** — shows battery toast
- **סיכום-בוקר** — morning briefing notification
- **שאל-סוכן** — dialog to ask the agent a question

## Required Plugins
Install from F-Droid (same repo as Termux):
- **Termux:Boot** — auto-start on device boot
- **Termux:Tasker** — Tasker integration
- **Termux:Widget** — home screen shortcuts
