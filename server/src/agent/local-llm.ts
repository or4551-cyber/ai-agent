import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

    // Unique per-call file to avoid concurrent-call collisions
    const promptDir = path.join(HOME, '.ai-agent');
    const promptFile = path.join(promptDir, `llm-prompt-${process.pid}-${crypto.randomBytes(6).toString('hex')}.txt`);

    // Raw user content goes to a file — never to a shell. No escaping needed.
    const promptContent = [SYS, '', `User: ${userMessage}`, 'Assistant:'].join('\n');
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(promptFile, promptContent);

    try {
      // spawnSync with argv array — no shell interpretation, immune to injection.
      const result = spawnSync(
        LLAMA_BIN,
        ['-m', MODEL_PATH, '-f', promptFile, '-n', '256', '--temp', '0.7', '--no-display-prompt'],
        { timeout: 60000, encoding: 'utf8', shell: false }
      );

      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        throw new Error(`llama-cli exited with status ${result.status}: ${result.stderr || ''}`);
      }

      const output = (result.stdout || '').trim();
      return output || 'LLM local: no output generated.';
    } catch (err) {
      throw new Error('Local LLM generation failed: ' + (err as Error).message);
    } finally {
      try { fs.unlinkSync(promptFile); } catch {}
    }
  }
}
