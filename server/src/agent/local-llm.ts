import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const HOME = process.env.HOME || '/data/data/com.termux/files/home';
const LLAMA_BIN = process.env.LLAMA_BIN || path.join(HOME, 'llama.cpp/llama-cli');
const MODEL_PATH = process.env.LLAMA_MODEL || path.join(HOME, 'llama.cpp/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');

const SYS = 'You are a helpful AI assistant on Android. Answer in user language. Short answers. No tools.';

export class LocalLLM {
  private available: boolean | null = null;

  isAvailable(): boolean {
    if (this.available !== null) return this.available;
    try {
      this.available = fs.existsSync(LLAMA_BIN) && fs.existsSync(MODEL_PATH);
    } catch {
      this.available = false;
    }
    console.log('[LocalLLM] Available:', this.available);
    return this.available;
  }

  generate(userMessage: string): string {
    if (!this.isAvailable()) {
      throw new Error('Local LLM not available');
    }

    const escaped = userMessage.replace(/["'`$\\]/g, '');
    const promptFile = path.join(HOME, '.ai-agent', 'llm-prompt.txt');

    // Write prompt to temp file to avoid shell escaping issues
    const promptContent = [SYS, '\nUser: ' + escaped, '\nAssistant:'].join('\n');
    fs.mkdirSync(path.dirname(promptFile), { recursive: true });
    fs.writeFileSync(promptFile, promptContent);

    try {
      const cmd = [
        LLAMA_BIN,
        '-m', MODEL_PATH,
        '-f', promptFile,
        '-n', '256',
        '--temp', '0.7',
        '--no-display-prompt',
      ].join(' ');

      const output = execSync(cmd, { timeout: 60000 }).toString().trim();

      if (!output) {
        return 'LLM local: no output generated.';
      }
      return output;
    } catch (err) {
      throw new Error('Local LLM generation failed: ' + (err as Error).message);
    } finally {
      try { fs.unlinkSync(promptFile); } catch {}
    }
  }
}
