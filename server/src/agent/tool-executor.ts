import { getDangerLevel } from '../tools/definitions';
import { DangerLevel } from '../types';
import * as fileSystem from '../tools/file-system';
import { runCommand } from '../tools/terminal';
import * as termuxApi from '../tools/termux-api';
import { sendEmail } from '../tools/email';
import { sendTelegram } from '../tools/telegram';
import * as git from '../tools/git';
import { webBrowse, webSearch } from '../tools/web-browse';
import { AgentMemory } from './memory';
import { ReminderService } from '../services/reminders';
import { RoutineService } from '../services/routines';

const memory = new AgentMemory();
const reminderService = new ReminderService();
const routineService = new RoutineService();

export interface ExecutionResult {
  output: string;
  dangerLevel: DangerLevel;
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<ExecutionResult> {
  const dangerLevel = getDangerLevel(toolName);

  try {
    const output = await executeToolInternal(toolName, input);
    return { output, dangerLevel };
  } catch (err) {
    return {
      output: `Error: ${(err as Error).message}`,
      dangerLevel,
    };
  }
}

async function executeToolInternal(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    // File System
    case 'read_file':
      return fileSystem.readFile(input.path as string);
    case 'write_file':
      return fileSystem.writeFile(input.path as string, input.content as string);
    case 'edit_file':
      return fileSystem.editFile(
        input.path as string,
        input.old_string as string,
        input.new_string as string
      );
    case 'delete_file':
      return fileSystem.deleteFile(input.path as string, input.recursive as boolean);
    case 'list_directory':
      return fileSystem.listDirectory(input.path as string);
    case 'search_files':
      return fileSystem.searchFiles(
        input.path as string,
        input.query as string,
        input.file_pattern as string | undefined
      );

    // Terminal
    case 'run_command':
      return runCommand(
        input.command as string,
        input.cwd as string | undefined,
        (input.timeout as number) || 30000
      );

    // Termux:API
    case 'gallery_list':
      return termuxApi.galleryList(
        input.directory as string | undefined,
        input.sort_by as string | undefined,
        input.limit as number | undefined
      );
    case 'gallery_organize':
      return termuxApi.galleryOrganize(
        input.source_dir as string,
        input.target_dir as string,
        input.organize_by as string
      );
    case 'send_sms':
      return termuxApi.sendSms(input.number as string, input.message as string);
    case 'get_contacts':
      return termuxApi.getContacts(input.search as string | undefined);
    case 'get_location':
      return termuxApi.getLocation();
    case 'take_photo':
      return termuxApi.takePhoto(
        input.camera_id as number | undefined,
        input.save_path as string | undefined
      );
    case 'get_clipboard':
      return termuxApi.getClipboard();
    case 'get_battery':
      return termuxApi.getBattery();
    case 'get_notifications':
      return termuxApi.getNotifications();

    // Communication
    case 'send_email':
      return sendEmail(
        input.to as string,
        input.subject as string,
        input.body as string,
        input.html as boolean
      );
    case 'send_telegram':
      return sendTelegram(input.message as string, input.chat_id as string | undefined);

    // Git
    case 'git_status':
      return git.gitStatus(input.path as string);
    case 'git_commit':
      return git.gitCommit(
        input.path as string,
        input.message as string,
        input.push as boolean
      );
    case 'git_clone':
      return git.gitClone(input.url as string, input.path as string);

    // Web
    case 'web_search':
      return webSearch(input.query as string);
    case 'web_browse':
      return webBrowse(input.url as string);

    // Memory
    case 'memory_set':
      memory.set(input.key as string, input.value as string);
      return `Remembered: ${input.key} = ${input.value}`;
    case 'memory_get': {
      const val = memory.get(input.key as string);
      return val ? `${input.key} = ${val}` : `No memory found for key: ${input.key}`;
    }
    case 'memory_list': {
      const entries = memory.list();
      if (entries.length === 0) return 'No memories stored yet.';
      return entries.map((m) => `- ${m.key}: ${m.value}`).join('\n');
    }
    case 'memory_delete': {
      const deleted = memory.delete(input.key as string);
      return deleted ? `Deleted memory: ${input.key}` : `No memory found for: ${input.key}`;
    }

    // Reminders
    case 'reminder_add': {
      const r = reminderService.add(input.text as string, new Date(input.dueAt as string));
      return `Reminder set: "${r.text}" at ${new Date(r.dueAt).toLocaleString('he-IL')} (ID: ${r.id})`;
    }
    case 'reminder_list': {
      const list = reminderService.list();
      if (list.length === 0) return 'No active reminders.';
      return list.map(r => `- [${r.id}] "${r.text}" — ${new Date(r.dueAt).toLocaleString('he-IL')}${r.done ? ' ✅' : ''}`).join('\n');
    }
    case 'reminder_complete':
      return reminderService.complete(input.id as string) ? 'Reminder completed.' : 'Reminder not found.';
    case 'reminder_delete':
      return reminderService.delete(input.id as string) ? 'Reminder deleted.' : 'Reminder not found.';

    // Routines
    case 'routine_add': {
      const routine = routineService.add(input.name as string, input.schedule as string, input.action as any);
      return `Routine created: "${routine.name}" (${routine.schedule}) — ID: ${routine.id}`;
    }
    case 'routine_list': {
      const routines = routineService.list();
      if (routines.length === 0) return 'No routines configured.';
      return routines.map(r => `- [${r.id}] "${r.name}" ${r.schedule} ${r.enabled ? '🟢' : '🔴'} (last: ${r.lastRun || 'never'})`).join('\n');
    }
    case 'routine_toggle':
      return routineService.toggle(input.id as string) ? 'Routine toggled.' : 'Routine not found.';
    case 'routine_delete':
      return routineService.remove(input.id as string) ? 'Routine deleted.' : 'Routine not found.';

    default:
      return `Unknown tool: ${toolName}`;
  }
}
