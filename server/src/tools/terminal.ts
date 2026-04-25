import { exec } from 'child_process';

// Commands that are known to take a long time — give them generous timeouts
const LONG_RUNNING_PATTERNS = [
  /\bpkg\s+(install|update|upgrade)/i,
  /\bapt\s+(install|update|upgrade)/i,
  /\bnpm\s+(install|ci|update)\b/i,
  /\bgit\s+(clone|pull|fetch)\b/i,
  /\bpip\s+install\b/i,
  /\bcurl\s+.*-[oO]\b/i,
  /\bwget\b/i,
];
const LONG_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function runCommand(
  command: string,
  cwd?: string,
  timeout = 30000
): Promise<string> {
  // Auto-extend timeout for known long-running commands
  const isLongRunning = LONG_RUNNING_PATTERNS.some(p => p.test(command));
  const effectiveTimeout = isLongRunning ? Math.max(timeout, LONG_TIMEOUT) : timeout;

  return new Promise((resolve, reject) => {
    const options = {
      cwd: cwd || process.env.WORKSPACE_DIR || process.cwd(),
      timeout: effectiveTimeout,
      maxBuffer: 1024 * 1024 * 5, // 5MB
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    };

    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          reject(new Error(`Command timed out after ${timeout}ms`));
          return;
        }
        // Still return output even on non-zero exit code
        const output = [
          stdout ? `STDOUT:\n${stdout}` : '',
          stderr ? `STDERR:\n${stderr}` : '',
          `Exit code: ${error.code}`,
        ]
          .filter(Boolean)
          .join('\n');
        resolve(output || error.message);
        return;
      }

      const output = [
        stdout ? stdout.trim() : '',
        stderr ? `STDERR: ${stderr.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      resolve(output || '(no output)');
    });
  });
}
