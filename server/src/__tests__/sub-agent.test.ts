import { describe, it, expect } from 'vitest';
import { READ_ONLY_TOOL_WHITELIST, formatSubAgentResult, type SubAgentResult } from '../services/sub-agent';

// We don't run real Anthropic calls in tests — those need network + a key.
// Instead, exercise the bits of sub-agent that CAN be unit-tested: the
// whitelist, the result formatter, and basic input validation logic
// reachable via the public API without network.

describe('sub-agent whitelist', () => {
  it('blocks all destructive tools by default', () => {
    const dangerous = [
      'write_file', 'edit_file', 'delete_file', 'run_command',
      'send_sms', 'send_email', 'send_telegram', 'whatsapp_reply',
      'make_call', 'gmail_send',
      'reminder_add', 'reminder_delete',
      'routine_add', 'routine_delete',
      'goal_add', 'goal_delete',
      'system_update', 'system_restart',
      'plugin_install', 'plugin_uninstall',
      'storage_delete_files', 'storage_clear_cache',
      'memory_set', 'memory_delete',
    ];
    for (const t of dangerous) {
      expect(READ_ONLY_TOOL_WHITELIST.has(t)).toBe(false);
    }
  });

  it('includes core read-only research tools', () => {
    const expected = [
      'web_search', 'web_browse', 'read_file', 'list_directory',
      'memory_search', 'memory_get',
    ];
    for (const t of expected) {
      expect(READ_ONLY_TOOL_WHITELIST.has(t)).toBe(true);
    }
  });
});

describe('formatSubAgentResult', () => {
  it('renders a successful result with metadata', () => {
    const r: SubAgentResult = {
      task: 'check x',
      result: 'x is fine',
      iterations: 2,
      toolsUsed: ['web_search'],
      inputTokens: 100,
      outputTokens: 50,
    };
    const s = formatSubAgentResult(r);
    expect(s).toContain('x is fine');
    expect(s).toContain('2 iterations');
    expect(s).toContain('1 tool calls');
    expect(s).toContain('150 tokens'); // 100 + 50
  });

  it('marks errored results clearly', () => {
    const r: SubAgentResult = {
      task: 'check x',
      result: 'something broke',
      iterations: 0,
      toolsUsed: [],
      inputTokens: 0,
      outputTokens: 0,
      errored: true,
      errorMsg: 'network',
    };
    const s = formatSubAgentResult(r);
    expect(s).toMatch(/❌|error|fail/i);
    expect(s).toContain('check x');
  });
});
