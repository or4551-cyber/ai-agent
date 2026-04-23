import { exec } from 'child_process';

export function runCommand(
  command: string,
  cwd?: string,
  timeout = 30000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      cwd: cwd || process.env.WORKSPACE_DIR || process.cwd(),
      timeout,
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
