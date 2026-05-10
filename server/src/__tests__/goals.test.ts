import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// goals.ts reads HOME at module-import time, so we MUST resetModules()
// + dynamic import per test to get a clean GOALS_FILE path.
let tmpHome: string;
let prevHome: string | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoalsService: any;

beforeEach(async () => {
  prevHome = process.env.HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-goals-'));
  process.env.HOME = tmpHome;
  vi.resetModules();
  ({ GoalsService } = await import('../services/goals'));
});

afterEach(() => {
  if (prevHome !== undefined) process.env.HOME = prevHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

describe('GoalsService', () => {
  it('add → list → get round trip', () => {
    const svc = new GoalsService('fake-key');
    const goal = svc.add({ description: 'watch flight prices', successCriteria: 'under 1500' });
    expect(goal.id).toMatch(/^goal-/);
    expect(goal.status).toBe('active');
    expect(svc.list()).toHaveLength(1);
    expect(svc.get(goal.id)?.description).toBe('watch flight prices');
  });

  it('rejects NaN/zero/negative interval (would never fire)', () => {
    const svc = new GoalsService('fake-key');
    const a = svc.add({ description: 't', checkIntervalMinutes: NaN });
    const b = svc.add({ description: 't', checkIntervalMinutes: 0 });
    const c = svc.add({ description: 't', checkIntervalMinutes: -10 });
    // All should fall back to the daily default.
    expect(a.checkIntervalMinutes).toBe(1440);
    expect(b.checkIntervalMinutes).toBe(1440);
    expect(c.checkIntervalMinutes).toBe(1440);
  });

  it('clamps intervals below 30 minutes', () => {
    const svc = new GoalsService('fake-key');
    const g = svc.add({ description: 't', checkIntervalMinutes: 5 });
    expect(g.checkIntervalMinutes).toBeGreaterThanOrEqual(30);
  });

  it('pause / resume / complete / delete affect status correctly', () => {
    const svc = new GoalsService('fake-key');
    const g = svc.add({ description: 't' });
    expect(svc.pause(g.id)).toBe(true);
    expect(svc.get(g.id)?.status).toBe('paused');
    expect(svc.resume(g.id)).toBe(true);
    expect(svc.get(g.id)?.status).toBe('active');
    expect(svc.complete(g.id, 'manual')).toBe(true);
    expect(svc.get(g.id)?.status).toBe('completed');
    // Resume on completed should refuse.
    expect(svc.resume(g.id)).toBe(false);
    expect(svc.delete(g.id)).toBe(true);
    expect(svc.get(g.id)).toBeUndefined();
  });

  it('list filters out completed by default', () => {
    const svc = new GoalsService('fake-key');
    const a = svc.add({ description: 'a' });
    svc.add({ description: 'b' });
    svc.complete(a.id);
    expect(svc.list(false).map((g: { description: string }) => g.description)).toEqual(['b']);
    expect(svc.list(true)).toHaveLength(2);
  });

  it('persists to disk (next instance sees the same goal)', () => {
    const svc1 = new GoalsService('fake-key');
    const g = svc1.add({ description: 'persisted' });
    const svc2 = new GoalsService('fake-key');
    expect(svc2.get(g.id)?.description).toBe('persisted');
  });

  it('start() refuses to spin the checker without an API key', () => {
    const svc = new GoalsService(''); // no key
    svc.start(); // should be no-op
    // Must not throw, must not pin the event loop. Since vitest pool: forks
    // the process exits cleanly only if no timer is pinned — verifying by
    // calling stop() is safe even when start was a no-op.
    expect(() => svc.stop()).not.toThrow();
  });
});
