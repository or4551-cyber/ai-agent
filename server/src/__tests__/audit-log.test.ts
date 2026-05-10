import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Each test gets its own HOME so files don't leak between cases. The audit-log
// module captures HOME into module-level constants at import time, so we MUST
// reset module cache before each test — otherwise the second test still
// writes to the first test's tmp dir.
let tmpHome: string;
let prevHome: string | undefined;

beforeEach(() => {
  prevHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-audit-'));
  process.env.HOME = tmpHome;
  vi.resetModules();
});

afterEach(() => {
  if (prevHome !== undefined) process.env.HOME = prevHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

describe('audit-log', () => {
  it('skips safe-level entries (only writes moderate/dangerous)', async () => {
    // Fresh import per test so the module reads our redirected HOME.
    const { recordToolExecution, buildEntry, readRecent } = await import('../services/audit-log');

    recordToolExecution(buildEntry({
      toolName: 'read_file',
      dangerLevel: 'safe',
      approved: false,
      startedAt: Date.now(),
      input: { path: '/tmp/x' },
      output: 'ok',
      outcome: 'success',
    }));

    expect(readRecent()).toHaveLength(0);
  });

  it('persists dangerous entries in newest-first order', async () => {
    const { recordToolExecution, buildEntry, readRecent } = await import('../services/audit-log');

    const t0 = Date.now();
    recordToolExecution(buildEntry({
      toolName: 'delete_file',
      dangerLevel: 'dangerous',
      approved: true,
      startedAt: t0,
      input: { path: '/tmp/a' },
      output: 'deleted',
      outcome: 'success',
    }));
    recordToolExecution(buildEntry({
      toolName: 'run_command',
      dangerLevel: 'dangerous',
      approved: true,
      startedAt: t0 + 1,
      input: { command: 'echo hi' },
      output: 'hi',
      outcome: 'success',
    }));

    const entries = readRecent();
    expect(entries).toHaveLength(2);
    // newest first
    expect(entries[0].toolName).toBe('run_command');
    expect(entries[1].toolName).toBe('delete_file');
  });

  it('truncates very long input fields without choking on big values', async () => {
    const { recordToolExecution, buildEntry, readRecent } = await import('../services/audit-log');

    const huge = 'x'.repeat(2_000_000); // 2 MB
    recordToolExecution(buildEntry({
      toolName: 'send_email',
      dangerLevel: 'dangerous',
      approved: true,
      startedAt: Date.now(),
      input: { body: huge },
      output: 'sent',
      outcome: 'success',
    }));

    const entries = readRecent();
    expect(entries).toHaveLength(1);
    // Preview must be tiny — full body should NEVER end up on disk.
    expect(entries[0].inputPreview.length).toBeLessThan(1000);
  });

  it('handles corrupt lines without losing the rest', async () => {
    const { recordToolExecution, buildEntry, readRecent } = await import('../services/audit-log');

    recordToolExecution(buildEntry({
      toolName: 'good_tool',
      dangerLevel: 'moderate',
      approved: true,
      startedAt: Date.now(),
      input: {},
      output: 'ok',
      outcome: 'success',
    }));

    // Inject a corrupt line into the file.
    const auditFile = path.join(tmpHome, '.ai-agent', 'audit.log');
    fs.appendFileSync(auditFile, '{this is not valid json\n');

    recordToolExecution(buildEntry({
      toolName: 'after_corrupt',
      dangerLevel: 'moderate',
      approved: true,
      startedAt: Date.now() + 1,
      input: {},
      output: 'ok',
      outcome: 'success',
    }));

    const entries = readRecent();
    // Both good entries should survive; the corrupt one is dropped.
    const names = entries.map(e => e.toolName);
    expect(names).toContain('good_tool');
    expect(names).toContain('after_corrupt');
  });
});
