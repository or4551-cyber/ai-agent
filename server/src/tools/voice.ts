import { execSync } from 'child_process';

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function speechToText(): string {
  const raw = safe(() => {
    return execSync('termux-speech-to-text 2>/dev/null', { timeout: 30000 }).toString().trim();
  }, '');
  
  if (!raw) return 'לא הצלחתי לזהות דיבור. נסה שוב.';
  return raw;
}

export function textToSpeech(text: string, lang = 'he'): string {
  try {
    // Use termux-tts-speak for TTS
    execSync(`termux-tts-speak -l ${lang} "${text.replace(/"/g, '\\"')}" 2>/dev/null`, {
      timeout: 30000,
    });
    return `הקראתי: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`;
  } catch (err) {
    return `שגיאה בהקראה: ${(err as Error).message}`;
  }
}
