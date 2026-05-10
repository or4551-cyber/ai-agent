import { describe, it, expect } from 'vitest';

// Test the registry primitives independently of the larger handler set so
// migration of new tools doesn't accidentally break dispatch semantics.

describe('tool-registry', () => {
  it('register + tryExecute round trip', async () => {
    const { registerTool, tryExecute, hasTool } = await import('../agent/tool-registry');
    registerTool('test_echo_unique_1', (i) => `echo:${i.value}`);
    expect(hasTool('test_echo_unique_1')).toBe(true);
    const out = await tryExecute('test_echo_unique_1', { value: 'hi' });
    expect(out).toBe('echo:hi');
  });

  it('tryExecute returns null for unregistered name (so caller can fallback)', async () => {
    const { tryExecute } = await import('../agent/tool-registry');
    const out = await tryExecute('definitely_not_registered_zzz', {});
    expect(out).toBeNull();
  });

  it('async handler is awaited', async () => {
    const { registerTool, tryExecute } = await import('../agent/tool-registry');
    registerTool('test_async_unique_2', async (i) => {
      await new Promise(r => setTimeout(r, 5));
      return `done:${i.x}`;
    });
    const out = await tryExecute('test_async_unique_2', { x: 42 });
    expect(out).toBe('done:42');
  });

  it('duplicate registration warns but overwrites (gradual migration support)', async () => {
    const { registerTool, tryExecute } = await import('../agent/tool-registry');
    registerTool('test_dup_unique_3', () => 'first');
    registerTool('test_dup_unique_3', () => 'second');
    const out = await tryExecute('test_dup_unique_3', {});
    expect(out).toBe('second');
  });
});
