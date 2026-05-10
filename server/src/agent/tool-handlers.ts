// Migrated tool handlers. As we move tools out of the legacy switch in
// tool-executor.ts, they go here. The switch in tool-executor still contains
// all unmigrated tools; the registry takes precedence over it.

import * as fileSystem from '../tools/file-system';
import { runCommand } from '../tools/terminal';
import { sendEmail } from '../tools/email';
import { sendTelegram } from '../tools/telegram';
import * as git from '../tools/git';
import { webBrowse, webSearch } from '../tools/web-browse';
import { speechToText, textToSpeech } from '../tools/voice';
import {
  agentMemory as memory,
  reminderService,
  routineService,
} from '../services/registry';
import { searchAsText as memorySearchText } from '../services/memory-search';
import { systemStatus, systemRestart, systemUpdate } from '../tools/system-tools';
import { registerTools } from './tool-registry';
import { isDryRun, dryRunDelete, dryRunCommand, dryRunSend } from './dry-run';

registerTools({
  // ===== File System =====
  read_file: (i) => fileSystem.readFile(i.path as string),
  write_file: (i) => fileSystem.writeFile(i.path as string, i.content as string),
  edit_file: (i) =>
    fileSystem.editFile(i.path as string, i.old_string as string, i.new_string as string),
  delete_file: (i) => isDryRun(i)
    ? dryRunDelete(i.path as string, i.recursive as boolean)
    : fileSystem.deleteFile(i.path as string, i.recursive as boolean),
  list_directory: (i) => fileSystem.listDirectory(i.path as string),
  search_files: (i) =>
    fileSystem.searchFiles(
      i.path as string,
      i.query as string,
      i.file_pattern as string | undefined
    ),

  // ===== Terminal =====
  run_command: (i) => isDryRun(i)
    ? dryRunCommand(i.command as string, i.cwd as string | undefined)
    : runCommand(
        i.command as string,
        i.cwd as string | undefined,
        (i.timeout as number) || 30000
      ),

  // ===== Communication =====
  send_email: (i) => isDryRun(i)
    ? dryRunSend('email', i.to as string, `Subject: ${i.subject}\n\n${i.body}`)
    : sendEmail(i.to as string, i.subject as string, i.body as string, i.html as boolean),
  send_telegram: (i) => isDryRun(i)
    ? dryRunSend('telegram', (i.chat_id as string) || 'default chat', i.message as string)
    : sendTelegram(i.message as string, i.chat_id as string | undefined),

  // ===== Git =====
  git_status: (i) => git.gitStatus(i.path as string),
  git_commit: (i) =>
    git.gitCommit(i.path as string, i.message as string, i.push as boolean),
  git_clone: (i) => git.gitClone(i.url as string, i.path as string),

  // ===== Web =====
  web_search: (i) => webSearch(i.query as string),
  web_browse: (i) => webBrowse(i.url as string),

  // ===== Voice =====
  speech_to_text: () => speechToText(),
  text_to_speech: (i) => textToSpeech(i.text as string, (i.lang as string) || 'he'),

  // ===== Memory =====
  memory_set: (i) => {
    memory.set(i.key as string, i.value as string);
    return `Remembered: ${i.key} = ${i.value}`;
  },
  memory_get: (i) => {
    const val = memory.get(i.key as string);
    return val ? `${i.key} = ${val}` : `No memory found for key: ${i.key}`;
  },
  memory_list: () => {
    const entries = memory.list();
    if (entries.length === 0) return 'No memories stored yet.';
    return entries.map((m) => `- ${m.key}: ${m.value}`).join('\n');
  },
  memory_delete: (i) => {
    const deleted = memory.delete(i.key as string);
    return deleted ? `Deleted memory: ${i.key}` : `No memory found for: ${i.key}`;
  },

  // ===== Reminders =====
  reminder_add: (i) => {
    const r = reminderService.add(i.text as string, new Date(i.dueAt as string));
    return `Reminder set: "${r.text}" at ${new Date(r.dueAt).toLocaleString('he-IL')} (ID: ${r.id})`;
  },
  reminder_list: () => {
    const list = reminderService.list();
    if (list.length === 0) return 'No active reminders.';
    return list
      .map(
        (r) =>
          `- [${r.id}] "${r.text}" — ${new Date(r.dueAt).toLocaleString('he-IL')}${r.done ? ' ✅' : ''}`
      )
      .join('\n');
  },
  reminder_complete: (i) =>
    reminderService.complete(i.id as string) ? 'Reminder completed.' : 'Reminder not found.',
  reminder_delete: (i) =>
    reminderService.delete(i.id as string) ? 'Reminder deleted.' : 'Reminder not found.',

  // ===== Routines =====
  routine_add: (i) => {
    const routine = routineService.add(
      i.name as string,
      i.schedule as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      i.action as any
    );
    return `Routine created: "${routine.name}" (${routine.schedule}) — ID: ${routine.id}`;
  },
  routine_list: () => {
    const routines = routineService.list();
    if (routines.length === 0) return 'No routines configured.';
    return routines
      .map(
        (r) =>
          `- [${r.id}] "${r.name}" ${r.schedule} ${r.enabled ? '🟢' : '🔴'} (last: ${r.lastRun || 'never'})`
      )
      .join('\n');
  },
  routine_toggle: (i) =>
    routineService.toggle(i.id as string) ? 'Routine toggled.' : 'Routine not found.',
  routine_delete: (i) =>
    routineService.remove(i.id as string) ? 'Routine deleted.' : 'Routine not found.',

  // ===== Memory Search =====
  memory_search: (i) =>
    memorySearchText(i.query as string, (i.limit as number) || 5),

  // ===== Self-maintenance =====
  system_status: () => systemStatus(),
  system_restart: (i) => systemRestart(i.reason as string),
  system_update: (i) => systemUpdate(i.reason as string),
});
