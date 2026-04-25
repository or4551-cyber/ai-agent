import { speechToText, textToSpeech } from '../tools/voice';
import { runCommand } from '../tools/terminal';

export type DaemonMode = 'sleep' | 'wake_word' | 'active';
export type DaemonEvent = 'mode_changed' | 'listening' | 'wake_detected' | 'user_speech' | 'thinking' | 'speaking' | 'response' | 'error' | 'shortcut_executed';

export interface DaemonStatus {
  mode: DaemonMode;
  active: boolean;
  sessionStart: string | null;
  totalCommands: number;
  lastCommand: string | null;
  lastResponse: string | null;
  silentSeconds: number;
}

export interface DaemonEventData {
  event: DaemonEvent;
  mode: DaemonMode;
  text?: string;
  timestamp: string;
}

// ===== SHORTCUT COMMANDS =====
interface ShortcutCommand {
  triggers: string[];
  action: (daemon: VoiceDaemon) => Promise<string>;
  description: string;
}

const WAKE_WORDS = ['מרלין', 'merlin', 'היי מרלין', 'hey merlin', 'הי מרלין'];
const STOP_WORDS = ['עצור', 'סיום', 'stop', 'הפסק', 'סטופ'];
const SLEEP_WORDS = ['כבה לגמרי', 'לילה טוב', 'כבה את עצמך', 'shut down'];

const ACTIVE_TIMEOUT_SEC = 30; // Return to wake_word after 30s silence
const WAKE_LISTEN_SEC = 4; // Short STT for wake word detection

const SHORTCUT_COMMANDS: ShortcutCommand[] = [
  {
    triggers: ['חזור למרלין', 'פתח מרלין', 'open merlin'],
    action: async () => {
      const port = process.env.PORT || '3002';
      await runCommand(`termux-open-url http://localhost:${port}/live 2>/dev/null`, undefined, 5000).catch(() => {});
      return 'פותח את Merlin';
    },
    description: 'פותח את אפליקציית Merlin',
  },
  {
    triggers: ['חזור אחורה', 'אחורה', 'back', 'go back'],
    action: async () => {
      await runCommand('input keyevent KEYCODE_BACK 2>/dev/null', undefined, 5000).catch(() => {});
      return 'לחצתי אחורה';
    },
    description: 'לוחץ על כפתור Back',
  },
  {
    triggers: ['בית', 'מסך הבית', 'home', 'go home'],
    action: async () => {
      await runCommand('input keyevent KEYCODE_HOME 2>/dev/null', undefined, 5000).catch(() => {});
      return 'חזרתי למסך הבית';
    },
    description: 'חוזר למסך הבית',
  },
  {
    triggers: ['צלם מסך', 'צילום מסך', 'screenshot'],
    action: async () => {
      const result = await runCommand(
        'termux-screenshot ~/storage/pictures/merlin-screenshot.png 2>/dev/null && echo "OK"',
        undefined, 10000
      ).catch(() => 'שגיאה בצילום');
      return result.includes('OK') ? 'צילמתי מסך' : 'לא הצלחתי לצלם מסך';
    },
    description: 'מצלם את המסך',
  },
  {
    triggers: ['מה אתה רואה', 'תתאר את המסך', 'what do you see'],
    action: async () => {
      // This will be handled by the agent (needs vision), return special marker
      return '__AGENT__:תצלם מסך ותתאר לי מה אתה רואה';
    },
    description: 'צילום + ניתוח מסך',
  },
  {
    triggers: ['חזור לי על זה', 'תגיד את זה שוב', 'תחזור', 'repeat', 'say again'],
    action: async (daemon) => {
      const last = daemon.getStatus().lastResponse;
      if (last) {
        return `__REPEAT__:${last}`;
      }
      return 'אין תשובה קודמת לחזור עליה';
    },
    description: 'חוזר על התשובה האחרונה',
  },
  {
    triggers: ['השתק', 'מצב שקט', 'silent', 'mute'],
    action: async () => {
      await runCommand('termux-volume music 0 2>/dev/null', undefined, 5000).catch(() => {});
      return 'הפעלתי מצב שקט';
    },
    description: 'מצב שקט',
  },
  {
    triggers: ['הגבר', 'הגבר קול', 'volume up'],
    action: async () => {
      await runCommand('termux-volume music 10 2>/dev/null', undefined, 5000).catch(() => {});
      return 'הגברתי את הקול';
    },
    description: 'מגביר קול',
  },
];

export class VoiceDaemon {
  private mode: DaemonMode = 'sleep';
  private running = false;
  private sessionStart: string | null = null;
  private totalCommands = 0;
  private lastCommand: string | null = null;
  private lastResponse: string | null = null;
  private silentTicks = 0;
  private onEvent: ((data: DaemonEventData) => void) | null = null;
  private processMessage: ((message: string) => Promise<string>) | null = null;

  // ===== CONFIGURATION =====

  setEventHandler(handler: (data: DaemonEventData) => void): void {
    this.onEvent = handler;
  }

  setMessageProcessor(handler: (message: string) => Promise<string>): void {
    this.processMessage = handler;
  }

  // ===== STATUS =====

  getStatus(): DaemonStatus {
    return {
      mode: this.mode,
      active: this.running,
      sessionStart: this.sessionStart,
      totalCommands: this.totalCommands,
      lastCommand: this.lastCommand,
      lastResponse: this.lastResponse,
      silentSeconds: this.silentTicks * WAKE_LISTEN_SEC,
    };
  }

  getMode(): DaemonMode {
    return this.mode;
  }

  isRunning(): boolean {
    return this.running;
  }

  // ===== CONTROL =====

  async start(mode: DaemonMode = 'wake_word'): Promise<string> {
    if (this.running) return 'Voice daemon is already running.';

    this.running = true;
    this.mode = mode;
    this.sessionStart = new Date().toISOString();
    this.silentTicks = 0;

    this.emit('mode_changed', mode);

    if (mode === 'active') {
      this.announceAsync('מצב Live פעיל. דבר אליי.');
    } else {
      this.announceAsync('מצב המתנה פעיל. אמור "היי מרלין" להתחיל.');
    }

    // Start the loop
    this.daemonLoop();

    // Update notification
    this.updateNotification();

    return mode === 'active'
      ? '🎙️ Voice Daemon — מצב Active. דבר אליי!'
      : '👂 Voice Daemon — מצב Wake Word. אמור "היי מרלין" להתחיל.';
  }

  stop(): string {
    this.running = false;
    this.mode = 'sleep';
    this.sessionStart = null;
    this.emit('mode_changed', 'sleep');
    this.announceAsync('הדיימון כבוי. להתראות.');
    this.clearNotification();
    return '🔇 Voice Daemon כבוי.';
  }

  setMode(newMode: DaemonMode): void {
    this.mode = newMode;
    this.silentTicks = 0;
    this.emit('mode_changed', newMode);
    this.updateNotification();
  }

  // ===== MAIN LOOP =====

  private async daemonLoop(): Promise<void> {
    while (this.running) {
      try {
        if (this.mode === 'sleep') {
          await this.sleep(2000);
          continue;
        }

        if (this.mode === 'wake_word') {
          await this.wakeWordLoop();
        } else if (this.mode === 'active') {
          await this.activeLoop();
        }
      } catch (err) {
        console.error('[VoiceDaemon] Loop error:', (err as Error).message);
        this.emit('error', undefined, (err as Error).message);
        await this.sleep(2000);
      }
    }
  }

  // ===== WAKE WORD DETECTION =====

  private async wakeWordLoop(): Promise<void> {
    this.emit('listening', 'wake_word');

    const heard = speechToText();

    if (!heard || heard.includes('לא הצלחתי')) {
      await this.sleep(500);
      return;
    }

    const lower = heard.trim().toLowerCase();

    // Check for wake word
    if (WAKE_WORDS.some(w => lower.includes(w))) {
      this.emit('wake_detected', 'active', heard);
      this.mode = 'active';
      this.silentTicks = 0;
      this.updateNotification();

      // Announce activation
      textToSpeech('כן, מה תרצה?', 'he');

      // If there's more text after the wake word, process it
      let remaining = heard;
      for (const w of WAKE_WORDS) {
        remaining = remaining.replace(new RegExp(w, 'gi'), '').trim();
      }
      if (remaining.length > 2) {
        await this.processUserSpeech(remaining);
      }
      return;
    }

    // Not a wake word, ignore
    await this.sleep(300);
  }

  // ===== ACTIVE MODE =====

  private async activeLoop(): Promise<void> {
    this.emit('listening', 'active');

    const heard = speechToText();

    if (!heard || heard.includes('לא הצלחתי')) {
      this.silentTicks++;
      // Return to wake_word after timeout
      if (this.silentTicks * WAKE_LISTEN_SEC >= ACTIVE_TIMEOUT_SEC) {
        this.mode = 'wake_word';
        this.silentTicks = 0;
        this.emit('mode_changed', 'wake_word');
        this.updateNotification();
        textToSpeech('חוזר למצב המתנה. אמור "היי מרלין" כדי לחזור.', 'he');
      }
      await this.sleep(500);
      return;
    }

    this.silentTicks = 0;
    await this.processUserSpeech(heard);
  }

  // ===== PROCESS USER SPEECH =====

  private async processUserSpeech(text: string): Promise<void> {
    const lower = text.trim().toLowerCase();

    this.lastCommand = text;
    this.totalCommands++;
    this.emit('user_speech', this.mode, text);

    // Check sleep words
    if (SLEEP_WORDS.some(w => lower.includes(w))) {
      this.stop();
      return;
    }

    // Check stop words (back to wake_word)
    if (STOP_WORDS.some(w => lower.includes(w))) {
      this.mode = 'wake_word';
      this.silentTicks = 0;
      this.emit('mode_changed', 'wake_word');
      this.updateNotification();
      textToSpeech('חוזר למצב המתנה.', 'he');
      return;
    }

    // Check shortcut commands
    for (const shortcut of SHORTCUT_COMMANDS) {
      if (shortcut.triggers.some(t => lower.includes(t))) {
        this.emit('shortcut_executed', this.mode, shortcut.description);
        try {
          const result = await shortcut.action(this);

          // Special markers
          if (result.startsWith('__AGENT__:')) {
            // Forward to agent
            const agentMsg = result.substring('__AGENT__:'.length);
            await this.sendToAgent(agentMsg);
            return;
          }
          if (result.startsWith('__REPEAT__:')) {
            const repeatText = result.substring('__REPEAT__:'.length);
            this.emit('speaking', this.mode, repeatText);
            textToSpeech(repeatText, 'he');
            return;
          }

          this.lastResponse = result;
          this.emit('response', this.mode, result);
          textToSpeech(result, 'he');
        } catch (err) {
          const errMsg = `שגיאה: ${(err as Error).message}`;
          this.emit('error', this.mode, errMsg);
          textToSpeech(errMsg, 'he');
        }
        return;
      }
    }

    // Not a shortcut — send to agent
    await this.sendToAgent(text);
  }

  // ===== SEND TO AGENT =====

  private async sendToAgent(message: string): Promise<void> {
    this.emit('thinking', this.mode, message);

    let response = 'לא הצלחתי לעבד את הבקשה.';
    if (this.processMessage) {
      try {
        response = await this.processMessage(message);
      } catch (err) {
        response = `שגיאה: ${(err as Error).message}`;
      }
    }

    // Clean for TTS
    const clean = response
      .replace(/[#*_`~\[\]()]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/https?:\/\/\S+/g, 'קישור')
      .substring(0, 500);

    this.lastResponse = clean;
    this.emit('speaking', this.mode, clean);
    this.emit('response', this.mode, response);

    textToSpeech(clean, 'he');
    await this.sleep(300);
  }

  // ===== NOTIFICATION =====

  private updateNotification(): void {
    const modeLabels: Record<DaemonMode, string> = {
      sleep: '💤 כבוי',
      wake_word: '👂 ממתין ל-"היי מרלין"',
      active: '🎙️ Live — מקשיב',
    };

    const title = `Merlin Voice — ${modeLabels[this.mode]}`;
    const content = this.mode === 'active'
      ? `פקודות: ${this.totalCommands} | אמור "עצור" לחזרה`
      : `אמור "היי מרלין" להתחיל`;

    const actionStart = `curl -s -X POST http://localhost:${process.env.PORT || 3002}/api/voice-daemon/activate -H "Authorization: Bearer ${process.env.AUTH_TOKEN || 'dev-token'}" > /dev/null`;
    const actionStop = `curl -s -X POST http://localhost:${process.env.PORT || 3002}/api/voice-daemon/stop -H "Authorization: Bearer ${process.env.AUTH_TOKEN || 'dev-token'}" > /dev/null`;

    const cmd = [
      'termux-notification',
      '--title', `"${title}"`,
      '--content', `"${content}"`,
      '--id', 'merlin-voice',
      '--ongoing',
      '--priority', 'low',
      '--button1', '"🎙️ Live"',
      '--button1-action', `"${actionStart}"`,
      '--button2', '"⏹️ כבה"',
      '--button2-action', `"${actionStop}"`,
    ].join(' ');

    runCommand(`${cmd} 2>/dev/null`, undefined, 5000).catch(() => {});
  }

  private clearNotification(): void {
    runCommand('termux-notification-remove merlin-voice 2>/dev/null', undefined, 5000).catch(() => {});
  }

  // ===== HELPERS =====

  private emit(event: DaemonEvent, mode?: DaemonMode, text?: string): void {
    if (this.onEvent) {
      this.onEvent({
        event,
        mode: mode || this.mode,
        text,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private announceAsync(text: string): void {
    try { textToSpeech(text, 'he'); } catch {}
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
