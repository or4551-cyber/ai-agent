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
  getGoalsService,
} from '../services/registry';
import { searchAsText as memorySearchText, reindexAll as memoryReindex } from '../services/memory-search';
import { embeddings } from '../services/embeddings';
import { vectorStore } from '../services/vector-store';
import { runSubAgent, runSubAgentsParallel, formatSubAgentResult } from '../services/sub-agent';
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
  memory_search: async (i) =>
    memorySearchText(i.query as string, (i.limit as number) || 5),

  memory_reindex: async () => {
    if (!embeddings.isAvailable()) {
      return '⚠️ חיפוש וקטורי לא פעיל. הוסף `VOYAGE_API_KEY` ב-.env (קבל מ-voyageai.com) והפעל מחדש.';
    }
    const r = await memoryReindex();
    return [
      `🔁 אינדוקס הסתיים`,
      `נוסף: ${r.added}`,
      `דולג (כבר באינדקס): ${r.skipped}`,
      `סה״כ באינדקס: ${r.total}`,
    ].join('\n');
  },

  memory_stats: () => {
    const stats = vectorStore.stats();
    return [
      `📊 סטטיסטיקת זיכרון וקטורי`,
      `מצב חיפוש: ${embeddings.isAvailable() ? '✅ וקטורי + מילולי' : '⚠️ מילולי בלבד (אין VOYAGE_API_KEY)'}`,
      `סה״כ פריטים מאונדקסים: ${stats.total}`,
      `  - 💾 זיכרונות: ${stats.bySource.memory}`,
      `  - 💬 שיחות: ${stats.bySource.conversation}`,
      `  - 📍 אירועים: ${stats.bySource.episode}`,
      `  - 📝 פתקים: ${stats.bySource.note}`,
    ].join('\n');
  },

  // ===== Goals (proactive autonomy) =====
  goal_add: (i) => {
    const g = getGoalsService().add({
      description: i.description as string,
      successCriteria: i.success_criteria as string | undefined,
      checkIntervalMinutes: i.check_interval_minutes as number | undefined,
      notifyOn: i.notify_on as 'always' | 'change' | 'completion' | undefined,
    });
    const hours = Math.round(g.checkIntervalMinutes / 60);
    return [
      `🎯 מטרה חדשה הוגדרה`,
      `ID: ${g.id}`,
      `מה: ${g.description}`,
      g.successCriteria ? `הצלחה: ${g.successCriteria}` : '',
      `בדיקה: כל ${hours < 24 ? `${hours} שעות` : `${Math.round(hours / 24)} ימים`}`,
      `התראה: ${g.notifyOn === 'always' ? 'תמיד' : g.notifyOn === 'change' ? 'רק כששינוי' : 'רק בסיום'}`,
    ].filter(Boolean).join('\n');
  },

  goal_list: (i) => {
    const goals = getGoalsService().list((i.include_completed as boolean) || false);
    if (goals.length === 0) return 'אין מטרות פעילות כרגע. השתמש ב-goal_add כדי ליצור.';
    const statusIcon: Record<string, string> = {
      active: '🟢', paused: '⏸', completed: '✅', failed: '❌',
    };
    const lines = [`🎯 ${goals.length} מטרות:`, ''];
    for (const g of goals) {
      const last = g.lastCheckedAt ? new Date(g.lastCheckedAt).toLocaleDateString('he-IL') : 'טרם נבדק';
      lines.push(`${statusIcon[g.status] || '·'} [${g.id}] ${g.description}`);
      lines.push(`   בדיקות: ${g.checks} · התראות: ${g.notifications} · אחרון: ${last}`);
      if (g.lastSummary) lines.push(`   📝 ${g.lastSummary}`);
      lines.push('');
    }
    return lines.join('\n');
  },

  goal_pause: (i) =>
    getGoalsService().pause(i.id as string) ? '⏸ המטרה הושהתה.' : 'מטרה לא נמצאה.',

  goal_resume: (i) =>
    getGoalsService().resume(i.id as string) ? '🟢 המטרה חזרה לפעילות.' : 'מטרה לא נמצאה או הושלמה.',

  goal_complete: (i) =>
    getGoalsService().complete(i.id as string, i.summary as string | undefined)
      ? '✅ המטרה סומנה כהושלמה.'
      : 'מטרה לא נמצאה.',

  goal_delete: (i) =>
    getGoalsService().delete(i.id as string) ? '🗑 המטרה נמחקה.' : 'מטרה לא נמצאה.',

  // ===== Sub-agents =====
  subagent_run: async (i) => {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) return '❌ סוכן משנה דורש ANTHROPIC_API_KEY מוגדר.';
    const r = await runSubAgent({
      task: i.task as string,
      apiKey,
      maxIterations: i.max_iterations as number | undefined,
    });
    return formatSubAgentResult(r);
  },

  subagent_run_parallel: async (i) => {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) return '❌ סוכני משנה דורשים ANTHROPIC_API_KEY מוגדר.';
    const tasks = i.tasks as string[];
    if (!Array.isArray(tasks) || tasks.length === 0) return '❌ tasks חייב להיות מערך לא ריק.';
    if (tasks.length > 5) return '❌ מקסימום 5 סוכני משנה במקביל.';
    try {
      const results = await runSubAgentsParallel(tasks, apiKey, i.max_iterations_each as number | undefined);
      const summary = `🤖 ${results.length} סוכני משנה הסתיימו (${results.filter((r) => r.errored).length} שגיאות)`;
      const sections = results.map((r, idx) => {
        const label = `### #${idx + 1} — ${r.task.slice(0, 80)}${r.task.length > 80 ? '…' : ''}`;
        return `${label}\n${formatSubAgentResult(r)}`;
      });
      return `${summary}\n\n${sections.join('\n\n---\n\n')}`;
    } catch (err) {
      return `❌ ${(err as Error).message}`;
    }
  },

  // ===== Self-maintenance =====
  system_status: () => systemStatus(),
  system_restart: (i) => systemRestart(i.reason as string),
  system_update: (i) => systemUpdate(i.reason as string),
});
