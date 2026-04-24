import { execSync } from 'child_process';
import { speechToText, textToSpeech } from '../tools/voice';

const STOP_WORDS = ['עצור', 'stop', 'הפסק', 'סטופ', 'עצירה', 'exit', 'quit', 'ביי'];

export class VoiceModeService {
  private active = false;
  private onStatus: ((status: string) => void) | null = null;
  private onUserSpeech: ((text: string) => void) | null = null;
  private processMessage: ((message: string) => Promise<string>) | null = null;

  setStatusHandler(handler: (status: string) => void): void {
    this.onStatus = handler;
  }

  setUserSpeechHandler(handler: (text: string) => void): void {
    this.onUserSpeech = handler;
  }

  setMessageProcessor(handler: (message: string) => Promise<string>): void {
    this.processMessage = handler;
  }

  isActive(): boolean {
    return this.active;
  }

  async start(): Promise<string> {
    if (this.active) return 'Voice mode is already active.';
    this.active = true;

    this.emitStatus('voice_started');
    
    // Announce start
    try {
      textToSpeech('מצב קולי פעיל. דבר אליי.', 'he');
    } catch {}

    // Start the loop in background
    this.voiceLoop();

    return '🎙️ מצב קולי הופעל. דבר אליי — אגיד "עצור" כדי לסיים.';
  }

  stop(): string {
    this.active = false;
    this.emitStatus('voice_stopped');
    try {
      textToSpeech('מצב קולי כבוי.', 'he');
    } catch {}
    return '🔇 מצב קולי כבוי.';
  }

  private emitStatus(status: string): void {
    if (this.onStatus) this.onStatus(status);
  }

  private async voiceLoop(): Promise<void> {
    while (this.active) {
      try {
        // Listen
        this.emitStatus('listening');
        const userSaid = speechToText();

        if (!userSaid || userSaid.includes('לא הצלחתי')) {
          // No speech detected, try again
          await this.sleep(500);
          continue;
        }

        // Report what user said
        if (this.onUserSpeech) this.onUserSpeech(userSaid);

        // Check for stop
        const lower = userSaid.trim().toLowerCase();
        if (STOP_WORDS.some(w => lower.includes(w))) {
          this.stop();
          return;
        }

        // Process with agent
        this.emitStatus('thinking');
        let response = 'לא הצלחתי לעבד את הבקשה.';
        if (this.processMessage) {
          try {
            response = await this.processMessage(userSaid);
          } catch (err) {
            response = 'שגיאה בעיבוד: ' + (err as Error).message;
          }
        }

        // Speak response
        this.emitStatus('speaking');
        // Clean markdown/emoji for cleaner TTS
        const cleanResponse = response
          .replace(/[#*_`~\[\]()]/g, '')
          .replace(/\n+/g, '. ')
          .substring(0, 500);
        
        textToSpeech(cleanResponse, 'he');

        // Small pause before next listen
        await this.sleep(300);
      } catch (err) {
        console.error('[VoiceMode] Loop error:', (err as Error).message);
        await this.sleep(1000);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
