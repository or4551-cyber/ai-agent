// Dry-run helpers — destructive tools accept a `dry_run: true` input to
// preview what they would do without actually doing it. The agent learns from
// the JSON Schema description that this flag exists, so it can call
// `delete_file({path: X, dry_run: true})` first when uncertain.

import * as fs from 'fs';

export function isDryRun(input: Record<string, unknown>): boolean {
  return input.dry_run === true;
}

export function dryRunDelete(filePath: string, recursive: boolean): string {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!recursive) return `🟡 Dry-run: would refuse — ${filePath} is a directory and recursive=false.`;
      let count = 0;
      let bytes = 0;
      const walk = (p: string) => {
        const entries = fs.readdirSync(p, { withFileTypes: true });
        for (const e of entries) {
          const full = `${p}/${e.name}`;
          if (e.isDirectory()) walk(full);
          else {
            count++;
            try { bytes += fs.statSync(full).size; } catch {}
          }
        }
      };
      walk(filePath);
      const mb = (bytes / 1024 / 1024).toFixed(2);
      return `🟡 Dry-run: would delete directory ${filePath} (${count} files, ${mb} MB).`;
    }
    const mb = (stat.size / 1024 / 1024).toFixed(2);
    return `🟡 Dry-run: would delete file ${filePath} (${mb} MB).`;
  } catch (err) {
    return `🟡 Dry-run: nothing to delete — ${(err as Error).message}`;
  }
}

export function dryRunCommand(cmd: string, cwd?: string): string {
  return [
    `🟡 Dry-run: would execute shell command (NOT executed):`,
    `cwd: ${cwd || process.cwd()}`,
    `command: ${cmd}`,
    ``,
    `(העבר dry_run=false כדי לבצע באמת.)`,
  ].join('\n');
}

export function dryRunSend(kind: string, target: string, body: string): string {
  return [
    `🟡 Dry-run: would send ${kind} to ${target} (NOT sent):`,
    `---`,
    body.length > 500 ? body.slice(0, 500) + '…' : body,
    `---`,
  ].join('\n');
}
