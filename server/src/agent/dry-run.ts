// Dry-run helpers — destructive tools accept a `dry_run: true` input to
// preview what they would do without actually doing it. The agent learns from
// the JSON Schema description that this flag exists, so it can call
// `delete_file({path: X, dry_run: true})` first when uncertain.

import * as fs from 'fs';

export function isDryRun(input: Record<string, unknown>): boolean {
  return input.dry_run === true;
}

// Defensive walker: lstat (don't follow symlinks → can't loop into / or $HOME),
// hard cap on file count and recursion depth, so a dry-run can't DoS the agent.
const DRY_RUN_MAX_FILES = 50_000;
const DRY_RUN_MAX_DEPTH = 12;

export function dryRunDelete(filePath: string, recursive: boolean): string {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      return `🟡 Dry-run: would delete symlink ${filePath} (target NOT followed).`;
    }
    if (stat.isDirectory()) {
      if (!recursive) return `🟡 Dry-run: would refuse — ${filePath} is a directory and recursive=false.`;
      let count = 0;
      let bytes = 0;
      let truncated = false;
      const walk = (p: string, depth: number): void => {
        if (truncated) return;
        if (depth > DRY_RUN_MAX_DEPTH) { truncated = true; return; }
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(p, { withFileTypes: true });
        } catch { return; }
        for (const e of entries) {
          if (truncated) return;
          if (count >= DRY_RUN_MAX_FILES) { truncated = true; return; }
          const full = `${p}/${e.name}`;
          try {
            const lst = fs.lstatSync(full);
            if (lst.isSymbolicLink()) continue; // never follow
            if (lst.isDirectory()) {
              walk(full, depth + 1);
            } else {
              count++;
              bytes += lst.size;
            }
          } catch { /* unreadable entry — skip */ }
        }
      };
      walk(filePath, 0);
      const mb = (bytes / 1024 / 1024).toFixed(2);
      const suffix = truncated
        ? ` (preview truncated at ${count} files / depth ${DRY_RUN_MAX_DEPTH} — actual size may be larger)`
        : '';
      return `🟡 Dry-run: would delete directory ${filePath} (${count} files, ${mb} MB)${suffix}.`;
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
