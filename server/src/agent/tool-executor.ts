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
import { StorageScanner } from '../services/storage-scanner';
import { speechToText, textToSpeech } from '../tools/voice';
import { getGoogleStatus } from '../tools/google-auth';
import * as googleServices from '../tools/google-services';
import { VoiceModeService } from '../services/voice-mode';
import { BackupService } from '../services/backup';
import { getPluginManager } from '../tools/definitions';
import { searchCatalog, getCatalogEntry, catalogToString } from '../services/plugin-catalog';

const memory = new AgentMemory();
const reminderService = new ReminderService();
const routineService = new RoutineService();
const storageScanner = new StorageScanner();
const backupService = new BackupService();
let globalVoiceMode: VoiceModeService | null = null;

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

    // Voice
    case 'speech_to_text':
      return speechToText();
    case 'text_to_speech':
      return textToSpeech(input.text as string, (input.lang as string) || 'he');

    // Storage Scanner
    case 'storage_scan': {
      const scanResult = await storageScanner.scan();
      const lines = [
        `📊 סריקה הושלמה:`,
        `סה״כ קבצים: ${scanResult.totalFiles}`,
        `נפח כללי: ${scanResult.totalSizeMb} MB`,
        `מקום פנוי: ${scanResult.freeSpaceMb} MB`,
        ``,
        `📁 קבצים גדולים (>50MB): ${scanResult.largeFiles.length}`,
        ...scanResult.largeFiles.slice(0, 10).map(f => `  - ${f.name} (${f.sizeMb}MB, ${f.category})`),
        ``,
        `🗁️ קבצי זבל: ${scanResult.junkFiles.length} (סה״כ ${scanResult.junkFiles.reduce((s, f) => s + f.sizeMb, 0).toFixed(1)}MB)`,
        `🗃️ קבצי cache: ${scanResult.cacheFiles.length} (סה״כ ${scanResult.cacheFiles.reduce((s, f) => s + f.sizeMb, 0).toFixed(1)}MB)`,
        `🔄 קבצים כפולים: ${scanResult.duplicates.length} קבוצות`,
        `📂 תיקיות ריקות: ${scanResult.emptyFolders.length}`,
        ``,
        `✨ פוטנציאל חיסכון: ${scanResult.totalSavingsMb} MB`,
      ];
      return lines.join('\n');
    }
    case 'storage_last_scan': {
      const last = storageScanner.getLastResult();
      if (!last) return 'אין סריקה קודמת. הרץ storage_scan קודם.';
      return JSON.stringify(last, null, 2);
    }
    case 'storage_delete_files': {
      const paths = input.paths as string[];
      const { deleted, errors } = storageScanner.deleteFiles(paths);
      return `נמחקו ${deleted} קבצים.${errors.length > 0 ? '\nשגיאות: ' + errors.join(', ') : ''}`;
    }
    case 'storage_clear_cache': {
      const { freedMb } = storageScanner.clearCache();
      return `🧹 ה-cache נוקה! שוחררו ${freedMb} MB.`;
    }
    case 'storage_delete_empty_folders': {
      const count = storageScanner.deleteEmptyFolders();
      return `📂 נמחקו ${count} תיקיות ריקות.`;
    }

    // Smart Briefing
    case 'smart_briefing':
      return termuxApi.smartBriefing();

    // QR Code Scanner
    case 'scan_qr_code':
      return termuxApi.scanQrCode(input.image_path as string | undefined);

    // Media Control
    case 'media_control':
      return termuxApi.mediaControl(input.action as string);
    case 'media_volume':
      return termuxApi.mediaVolume(input.level as number | undefined, input.action as string | undefined);
    case 'media_now_playing':
      return termuxApi.mediaNowPlaying();

    // App Launcher
    case 'open_app':
      return termuxApi.openApp(input.app_name as string);
    case 'list_apps':
      return termuxApi.listApps(input.filter as string | undefined);

    // Calendar
    case 'calendar_list':
      return termuxApi.calendarList((input.days as number) || 1);
    case 'calendar_add':
      return termuxApi.calendarAdd(
        input.title as string,
        input.start_time as string,
        input.end_time as string | undefined,
        input.location as string | undefined
      );

    // WhatsApp
    case 'whatsapp_messages':
      return termuxApi.whatsappMessages();
    case 'whatsapp_reply':
      return termuxApi.whatsappReply(input.contact_name as string, input.message as string);

    // Phone Call
    case 'make_call':
      return termuxApi.makeCall(input.number as string);

    // Share
    case 'share_content':
      return termuxApi.shareContent(input.content as string, (input.content_type as 'text' | 'file') || 'text', input.title as string | undefined);

    // Record Audio
    case 'record_audio':
      return termuxApi.recordAudio((input.duration_seconds as number) || 10, input.output_path as string | undefined);

    // Dialog & Toast
    case 'show_dialog':
      return termuxApi.showDialog(input.type as 'confirm' | 'text' | 'radio' | 'spinner' | 'toast', input.title as string | undefined, input.message as string | undefined, input.values as string[] | undefined);

    // Sensors
    case 'get_sensors':
      return termuxApi.getSensors(input.sensor_name as string | undefined);

    // Plugins
    case 'plugin_catalog': {
      const query = input.query as string | undefined;
      if (query) {
        const results = searchCatalog(query);
        if (results.length === 0) return `לא נמצאו פלגינים עבור "${query}". אני יכול ליצור פלגין חדש מותאם אישית — פשוט תגיד לי מה אתה צריך.`;
        return `🔍 נמצאו ${results.length} פלגינים עבור "${query}":\n\n` +
          results.map(p => `📦 **${p.name}** — ${p.descriptionHe}\n   תלויות: ${p.dependencies.join(', ') || 'אין'}`).join('\n\n') +
          `\n\nלהתקין? השתמש ב-plugin_install עם שם הפלגין.`;
      }
      return `📋 קטלוג פלגינים זמינים:\n\n${catalogToString()}\n\nלהתקנה: plugin_install name="<שם>"`;
    }

    case 'plugin_install': {
      const pm = getPluginManager();
      const name = input.name as string;
      
      // Try catalog first
      const catalogEntry = getCatalogEntry(name);
      if (catalogEntry) {
        return pm.install(
          catalogEntry.name,
          catalogEntry.description,
          catalogEntry.handlerCode,
          catalogEntry.inputSchema,
          {
            dangerLevel: catalogEntry.dangerLevel,
            version: catalogEntry.version,
            author: catalogEntry.author,
            source: 'catalog',
            dependencies: catalogEntry.dependencies,
          }
        );
      }

      // Custom plugin
      const desc = input.description as string;
      const handlerCode = input.handler_code as string;
      const schema = input.input_schema as Record<string, unknown>;
      const deps = input.dependencies as string[] | undefined;

      if (!desc || !handlerCode) {
        return `❌ פלגין "${name}" לא נמצא בקטלוג. ליצירת פלגין מותאם, ספק: description, handler_code ו-input_schema.`;
      }

      return pm.install(name, desc, handlerCode, schema || { type: 'object', properties: {} }, {
        source: 'ai-generated',
        dependencies: deps,
      });
    }

    case 'plugin_list':
      return getPluginManager().list();

    case 'plugin_uninstall':
      return getPluginManager().uninstall(input.name as string);

    // Backup
    case 'backup_create':
      return backupService.createBackup();
    case 'backup_list': {
      const backups = backupService.listBackups();
      if (backups.length === 0) return 'אין גיבויים זמינים עדיין. השתמש ב-backup_create כדי ליצור גיבוי.';
      return backups.map(b => `📦 ${b.id}\n   📅 ${b.timestamp}\n   📁 ${b.fileCount} קבצים (${(b.size / 1024).toFixed(0)} KB)`).join('\n\n');
    }
    case 'backup_restore':
      return backupService.restoreBackup(input.backup_id as string | undefined);

    // Voice Mode
    case 'voice_chat': {
      if (!globalVoiceMode) {
        globalVoiceMode = new VoiceModeService();
      }
      const vm = globalVoiceMode;
      const action = input.action as string;
      if (action === 'start') {
        return vm.start();
      } else {
        return vm.stop();
      }
    }

    // ===== GOOGLE SERVICES =====
    case 'google_status': {
      const status = getGoogleStatus();
      if (!status.configured) return '❌ Google לא מוגדר. הוסף GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET ל-.env';
      if (!status.authenticated) return `🔗 Google לא מחובר. היכנס לכתובת הבאה בדפדפן:\n${status.authUrl}`;
      return '✅ Google מחובר ופעיל!';
    }
    // Gmail
    case 'gmail_list':
      return googleServices.gmailListMessages(input.query as string | undefined, (input.max_results as number) || 10);
    case 'gmail_read':
      return googleServices.gmailReadMessage(input.message_id as string);
    case 'gmail_send':
      return googleServices.gmailSend(input.to as string, input.subject as string, input.body as string);
    case 'gmail_search':
      return googleServices.gmailSearch(input.query as string);
    case 'gmail_mark_read':
      return googleServices.gmailMarkRead(input.message_id as string);
    // Drive
    case 'drive_list':
      return googleServices.driveListFiles(input.query as string | undefined, (input.max_results as number) || 15);
    case 'drive_search':
      return googleServices.driveSearch(input.query as string);
    case 'drive_get':
      return googleServices.driveGetFile(input.file_id as string);
    case 'drive_create': {
      const typeMap: Record<string, string> = {
        doc: 'application/vnd.google-apps.document',
        sheet: 'application/vnd.google-apps.spreadsheet',
        text: 'text/plain',
      };
      return googleServices.driveCreateFile(
        input.name as string,
        input.content as string,
        typeMap[(input.type as string) || 'text'],
        input.folder_id as string | undefined
      );
    }
    case 'drive_share':
      return googleServices.driveShareFile(input.file_id as string, input.email as string, (input.role as string) || 'reader');
    // Tasks
    case 'google_tasks_list':
      return googleServices.tasksListAll((input.max_results as number) || 20);
    case 'google_tasks_add':
      return googleServices.tasksAdd(input.title as string, input.notes as string | undefined, input.due_date as string | undefined, input.tasklist_id as string | undefined);
    case 'google_tasks_complete':
      return googleServices.tasksComplete(input.task_id as string, input.tasklist_id as string | undefined);
    case 'google_tasks_delete':
      return googleServices.tasksDelete(input.task_id as string, input.tasklist_id as string | undefined);
    // Calendar (Google API)
    case 'gcal_list':
      return googleServices.gcalListEvents((input.days as number) || 3, (input.max_results as number) || 15);
    case 'gcal_add':
      return googleServices.gcalAddEvent(input.title as string, input.start_time as string, input.end_time as string | undefined, input.location as string | undefined, input.description as string | undefined);
    case 'gcal_delete':
      return googleServices.gcalDeleteEvent(input.event_id as string);
    // Contacts
    case 'google_contacts':
      return googleServices.contactsList(input.query as string | undefined, (input.max_results as number) || 20);

    default: {
      // Try executing as a plugin
      const pm = getPluginManager();
      if (pm.isPluginTool(toolName)) {
        const pluginName = toolName.replace('plugin_', '');
        return pm.execute(pluginName, input);
      }
      return `Unknown tool: ${toolName}`;
    }
  }
}
