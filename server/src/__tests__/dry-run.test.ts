import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isDryRun, dryRunDelete, dryRunCommand, dryRunSend } from '../agent/dry-run';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-dryrun-'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

describe('isDryRun', () => {
  it('detects exact true', () => {
    expect(isDryRun({ dry_run: true })).toBe(true);
  });
  it('rejects truthy non-boolean (be strict so a typo doesn\'t skip execution)', () => {
    expect(isDryRun({ dry_run: 'yes' })).toBe(false);
    expect(isDryRun({ dry_run: 1 })).toBe(false);
  });
  it('rejects missing flag', () => {
    expect(isDryRun({})).toBe(false);
  });
});

describe('dryRunDelete', () => {
  it('reports file size for a single file', () => {
    const f = path.join(tmp, 'x.txt');
    fs.writeFileSync(f, 'hello world');
    const out = dryRunDelete(f, false);
    expect(out).toContain('Dry-run');
    expect(out).toContain('would delete file');
  });

  it('refuses to walk a directory unless recursive=true', () => {
    fs.mkdirSync(path.join(tmp, 'd'));
    const out = dryRunDelete(path.join(tmp, 'd'), false);
    expect(out).toMatch(/refuse|directory.*recursive/i);
  });

  it('counts files when recursive=true', () => {
    const d = path.join(tmp, 'sub');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'a.txt'), 'aaa');
    fs.writeFileSync(path.join(d, 'b.txt'), 'bb');
    const out = dryRunDelete(d, true);
    expect(out).toContain('2 files');
  });

  it('does not follow symlinks (DoS protection)', () => {
    const d = path.join(tmp, 'safe');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'inside.txt'), 'x');
    // Skip on Windows where symlink permission may not be available.
    if (process.platform !== 'win32') {
      try {
        fs.symlinkSync(d, path.join(d, 'loop'));
      } catch {
        return; // not allowed in this env
      }
      const out = dryRunDelete(d, true);
      // Must terminate quickly; without lstat protection the symlink loop
      // would have caused an infinite/very slow walk.
      expect(out).toContain('files');
    }
  });

  it('returns helpful message on missing path', () => {
    const out = dryRunDelete(path.join(tmp, 'does-not-exist'), false);
    expect(out).toContain('nothing to delete');
  });
});

describe('dryRunCommand', () => {
  it('returns a preview without executing', () => {
    const out = dryRunCommand('rm -rf /', '/tmp');
    expect(out).toContain('NOT executed');
    expect(out).toContain('rm -rf /');
  });
});

describe('dryRunSend', () => {
  it('truncates very long bodies', () => {
    const huge = 'a'.repeat(10_000);
    const out = dryRunSend('email', 'x@y.com', huge);
    expect(out.length).toBeLessThan(2000);
    expect(out).toContain('would send email');
  });
});
