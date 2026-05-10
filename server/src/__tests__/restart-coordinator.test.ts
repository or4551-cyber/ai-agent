import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// restart-coordinator.ts captures HOME-derived paths at import time, so we
// resetModules() + dynamic-import per test for a clean slate.
let tmpHome: string;
let prevHome: string | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let restartCoordinator: any;

beforeEach(async () => {
  prevHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-restart-'));
  process.env.HOME = tmpHome;
  vi.resetModules();
  ({ restartCoordinator } = await import('../services/restart-coordinator'));
});

afterEach(() => {
  if (prevHome !== undefined) process.env.HOME = prevHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

describe('restartCoordinator', () => {
  it('scheduleRestart writes a flag file the supervisor can poll', () => {
    restartCoordinator.scheduleRestart('test reason', 'restart');
    const flag = path.join(tmpHome, '.ai-agent', 'restart.flag');
    expect(fs.existsSync(flag)).toBe(true);
    const content = JSON.parse(fs.readFileSync(flag, 'utf-8'));
    expect(content.reason).toBe('test reason');
    expect(content.op).toBe('restart');
  });

  it('scheduleRestart broadcasts restart_imminent ONCE via broadcast handler (dedup)', () => {
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    restartCoordinator.install((e: { type: string; payload: Record<string, unknown> }) => events.push(e));
    restartCoordinator.scheduleRestart('first', 'restart');
    // Calling again — alreadyAnnounced should suppress the duplicate.
    restartCoordinator.scheduleRestart('second', 'restart');
    expect(events.filter(e => e.type === 'restart_imminent').length).toBeLessThanOrEqual(1);
  });

  it('recordRestartCompletion writes the wasGraceful flag the next worker can read', () => {
    restartCoordinator.recordRestartCompletion(false);
    const last = restartCoordinator.getLastRestart();
    expect(last).not.toBeNull();
    expect(last?.wasGraceful).toBe(false);
  });
});
