import { ToolDefinition, DangerLevel } from '../types';

export interface ToolMeta {
  definition: ToolDefinition;
  dangerLevel: DangerLevel;
}

export const TOOL_DEFINITIONS: ToolMeta[] = [
  // ===== FILE SYSTEM =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the file content as text.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'write_file',
      description: 'Create a new file or overwrite an existing file with the given content.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file to write' },
          content: { type: 'string', description: 'Content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'edit_file',
      description: 'Edit a file by replacing a specific string with a new string. Use read_file first to see the current content.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file to edit' },
          old_string: { type: 'string', description: 'The exact string to find and replace' },
          new_string: { type: 'string', description: 'The string to replace it with' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'delete_file',
      description: 'Delete a file or directory. Use with caution!',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file or directory to delete' },
          recursive: { type: 'boolean', description: 'If true, delete directories recursively' },
        },
        required: ['path'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'list_directory',
      description: 'List files and directories in a given path. Returns names, sizes, and types.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the directory to list' },
        },
        required: ['path'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'search_files',
      description: 'Search for a text pattern in files within a directory. Returns matching lines with file paths.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to search in' },
          query: { type: 'string', description: 'Text or regex pattern to search for' },
          file_pattern: { type: 'string', description: 'Optional glob pattern to filter files (e.g. "*.ts")' },
        },
        required: ['path', 'query'],
      },
    },
  },

  // ===== TERMINAL =====
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'run_command',
      description: 'Run a shell command in bash and return the output. Can run any command: npm, git, python, etc.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Working directory for the command (optional)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        },
        required: ['command'],
      },
    },
  },

  // ===== DEVICE (Termux:API) =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'gallery_list',
      description: 'List photos and videos from the device gallery. Returns file paths, dates, and sizes.',
      input_schema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to scan (default: /storage/emulated/0/DCIM)' },
          sort_by: { type: 'string', description: 'Sort by: "date", "name", or "size"' },
          limit: { type: 'number', description: 'Maximum number of items to return' },
        },
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'gallery_organize',
      description: 'Organize photos into folders by date, type, or custom criteria.',
      input_schema: {
        type: 'object',
        properties: {
          source_dir: { type: 'string', description: 'Source directory containing photos' },
          target_dir: { type: 'string', description: 'Target directory for organized photos' },
          organize_by: { type: 'string', description: 'Organize by: "month", "year", "type"' },
        },
        required: ['source_dir', 'target_dir', 'organize_by'],
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'send_sms',
      description: 'Send an SMS message to a phone number.',
      input_schema: {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Phone number to send SMS to' },
          message: { type: 'string', description: 'Message text' },
        },
        required: ['number', 'message'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'get_contacts',
      description: 'Get the contact list from the device.',
      input_schema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional search query to filter contacts by name' },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'get_location',
      description: 'Get the current GPS location of the device.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'take_photo',
      description: 'Take a photo using the device camera.',
      input_schema: {
        type: 'object',
        properties: {
          camera_id: { type: 'number', description: '0 for back camera, 1 for front camera' },
          save_path: { type: 'string', description: 'Path to save the photo' },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'get_clipboard',
      description: 'Get the current clipboard content.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'get_battery',
      description: 'Get battery status (level, charging, temperature).',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'get_notifications',
      description: 'Get recent notifications from the device.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },

  // ===== COMMUNICATION =====
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'send_email',
      description: 'Send an email via SMTP.',
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (plain text or HTML)' },
          html: { type: 'boolean', description: 'If true, body is treated as HTML' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'send_telegram',
      description: 'Send a message via Telegram bot.',
      input_schema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message text' },
          chat_id: { type: 'string', description: 'Telegram chat ID (optional, uses default from env)' },
        },
        required: ['message'],
      },
    },
  },

  // ===== GIT =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'git_status',
      description: 'Get git status of a repository.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the git repository' },
        },
        required: ['path'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'git_commit',
      description: 'Stage all changes and create a git commit. Optionally push.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the git repository' },
          message: { type: 'string', description: 'Commit message' },
          push: { type: 'boolean', description: 'If true, push after commit' },
        },
        required: ['path', 'message'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'git_clone',
      description: 'Clone a git repository.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Repository URL' },
          path: { type: 'string', description: 'Target directory' },
        },
        required: ['url', 'path'],
      },
    },
  },

  // ===== WEB =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'web_search',
      description: 'Search the web and return results.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'web_browse',
      description: 'Fetch and read a web page. Returns the text content.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  // ===== MEMORY =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'memory_set',
      description: 'Remember something about the user for future conversations. Use this to store preferences, names, important info.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Short key/label (e.g. "user_name", "preferred_language")' },
          value: { type: 'string', description: 'The value to remember' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'memory_get',
      description: 'Retrieve a specific memory by key.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The key to look up' },
        },
        required: ['key'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'memory_list',
      description: 'List all stored memories.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'memory_delete',
      description: 'Delete a stored memory.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The key to delete' },
        },
        required: ['key'],
      },
    },
  },
  // ===== REMINDERS =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'reminder_add',
      description: 'Set a reminder that will trigger a notification at the specified time. Use ISO format for dueAt.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'What to remind about' },
          dueAt: { type: 'string', description: 'When to trigger (ISO 8601)' },
        },
        required: ['text', 'dueAt'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'reminder_list',
      description: 'List all active reminders.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'reminder_complete',
      description: 'Mark a reminder as complete.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Reminder ID' },
        },
        required: ['id'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'reminder_delete',
      description: 'Delete a reminder.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Reminder ID' },
        },
        required: ['id'],
      },
    },
  },
  // ===== ROUTINES =====
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'routine_add',
      description: 'Create a scheduled automation. Schedule formats: "daily:HH:MM", "weekly:day:HH:MM", "hourly". Action types: command, notification, ai_prompt.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Routine name' },
          schedule: { type: 'string', description: 'Schedule: daily:07:00, weekly:mon:09:00, hourly' },
          action: {
            type: 'object',
            description: 'Action to run. Types: { type: "command", command: "..." } | { type: "notification", title: "...", message: "..." } | { type: "ai_prompt", prompt: "..." }',
          },
        },
        required: ['name', 'schedule', 'action'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'routine_list',
      description: 'List all routines.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'routine_toggle',
      description: 'Enable or disable a routine.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Routine ID' },
        },
        required: ['id'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'routine_delete',
      description: 'Delete a routine.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Routine ID' },
        },
        required: ['id'],
      },
    },
  },
  // ===== VOICE =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'speech_to_text',
      description: 'Listen to the user speaking through the phone microphone and convert to text. Opens the speech recognition dialog.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'text_to_speech',
      description: 'Read text aloud through the phone speaker. Use this to speak to the user.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to speak aloud' },
          lang: { type: 'string', description: 'Language code (default: he)', enum: ['he', 'en', 'ar'] },
        },
        required: ['text'],
      },
    },
  },
  // ===== STORAGE SCANNER =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'storage_scan',
      description: 'Deep scan the phone storage to find large files, duplicates, junk/cache files, and empty folders. Returns a report with potential cleanup savings.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'storage_last_scan',
      description: 'Get the result of the last storage scan without scanning again.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'storage_delete_files',
      description: 'Delete specific files from storage. Requires user approval. Provide array of full file paths.',
      input_schema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Full paths of files to delete',
          },
        },
        required: ['paths'],
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'storage_clear_cache',
      description: 'Clear all cache and thumbnail directories on the phone. Frees significant space.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'storage_delete_empty_folders',
      description: 'Delete all empty folders in storage.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // ===== SMART BRIEFING =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'smart_briefing',
      description: 'Get a smart daily briefing: battery, calendar events, WhatsApp messages, storage, reminders — all in one summary.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  // ===== QR CODE SCANNER =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'scan_qr_code',
      description: 'Scan a QR code or barcode. Takes a photo and decodes it. Optionally provide a path to an existing image.',
      input_schema: {
        type: 'object',
        properties: {
          image_path: { type: 'string', description: 'Path to an existing image with QR code (optional — will take a photo if not provided)' },
        },
      },
    },
  },
  // ===== MEDIA CONTROL =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'media_control',
      description: 'Control media playback: play, pause, stop, next, previous, play_pause.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Action: play, pause, stop, next, previous, play_pause', enum: ['play', 'pause', 'stop', 'next', 'previous', 'play_pause'] },
        },
        required: ['action'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'media_volume',
      description: 'Control or check the device volume. Set level (0-15), or action: up/down/mute. No args = show current volume.',
      input_schema: {
        type: 'object',
        properties: {
          level: { type: 'number', description: 'Volume level 0-15' },
          action: { type: 'string', description: 'up, down, or mute', enum: ['up', 'down', 'mute'] },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'media_now_playing',
      description: 'Get info about what is currently playing (music, video, etc).',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  // ===== APP LAUNCHER =====
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'open_app',
      description: 'Open an app on the phone. Supports Hebrew and English names: WhatsApp, ווטסאפ, Spotify, Chrome, Settings, etc. Can also accept package names.',
      input_schema: {
        type: 'object',
        properties: {
          app_name: { type: 'string', description: 'App name (Hebrew/English) or package name' },
        },
        required: ['app_name'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'list_apps',
      description: 'List installed apps on the phone. Optionally filter by name.',
      input_schema: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Optional filter to search by name' },
        },
      },
    },
  },
  // ===== CALENDAR =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'calendar_list',
      description: 'List upcoming calendar events. Returns events for the specified number of days ahead.',
      input_schema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look ahead (default: 1)' },
        },
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'calendar_add',
      description: 'Add a new event to the phone calendar.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          start_time: { type: 'string', description: 'Start time in ISO format (e.g. 2025-01-15T10:00:00)' },
          end_time: { type: 'string', description: 'End time in ISO format (optional, defaults to 1 hour after start)' },
          location: { type: 'string', description: 'Event location (optional)' },
        },
        required: ['title', 'start_time'],
      },
    },
  },
  // ===== WHATSAPP =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'whatsapp_messages',
      description: 'Read recent WhatsApp messages from device notifications. Shows sender name and message content.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'whatsapp_reply',
      description: 'Reply to a WhatsApp message. Finds the notification from the contact and sends a reply. Requires user approval.',
      input_schema: {
        type: 'object',
        properties: {
          contact_name: { type: 'string', description: 'Name of the contact to reply to' },
          message: { type: 'string', description: 'Message to send' },
        },
        required: ['contact_name', 'message'],
      },
    },
  },
  // ===== PHONE CALL =====
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'make_call',
      description: 'Make a phone call to a given number. Opens the dialer and initiates the call. Requires user approval.',
      input_schema: {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Phone number to call (e.g. "0501234567" or "+972501234567")' },
        },
        required: ['number'],
      },
    },
  },
  // ===== SHARE CONTENT =====
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'share_content',
      description: 'Share text or a file to other apps via Android share dialog (WhatsApp, Gmail, Telegram, etc).',
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Text to share, or file path if content_type is "file"' },
          content_type: { type: 'string', description: '"text" or "file"', enum: ['text', 'file'] },
          title: { type: 'string', description: 'Optional title for the share dialog' },
        },
        required: ['content'],
      },
    },
  },
  // ===== RECORD AUDIO =====
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'record_audio',
      description: 'Record audio from the phone microphone for a given duration. Saves as m4a file.',
      input_schema: {
        type: 'object',
        properties: {
          duration_seconds: { type: 'number', description: 'Recording duration in seconds (default 10, max 300)' },
          output_path: { type: 'string', description: 'Optional: custom file path for the recording' },
        },
      },
    },
  },
  // ===== DIALOG & TOAST =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'show_dialog',
      description: 'Show a dialog or toast notification on the phone screen. Types: confirm (yes/no), text (input), radio (single choice), spinner (dropdown), toast (quick message).',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Dialog type', enum: ['confirm', 'text', 'radio', 'spinner', 'toast'] },
          title: { type: 'string', description: 'Dialog title' },
          message: { type: 'string', description: 'Dialog message or hint' },
          values: { type: 'array', items: { type: 'string' }, description: 'Options for radio/spinner type' },
        },
        required: ['type'],
      },
    },
  },
  // ===== SENSORS =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'get_sensors',
      description: 'Read phone sensors (accelerometer, gyroscope, proximity, light, etc). Without a sensor name, lists all available sensors.',
      input_schema: {
        type: 'object',
        properties: {
          sensor_name: { type: 'string', description: 'Specific sensor name to read (e.g. "accelerometer", "proximity"). Leave empty to list all.' },
        },
      },
    },
  },
  // ===== PLUGINS =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'plugin_catalog',
      description: 'Show available plugins that can be installed to extend agent capabilities. Search by name, topic, or keyword. Use this when the user asks for something you cannot do — there might be a plugin for it.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — topic, name, or keyword (e.g. "weather", "translate", "crypto"). Leave empty to show all.' },
        },
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'plugin_install',
      description: 'Install a plugin from the catalog by name, or create a custom plugin. For catalog: just provide "name". For custom: provide name, description, handler_code (bash script), and input_schema.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Plugin name (from catalog, or new unique name for custom)' },
          description: { type: 'string', description: 'Plugin description (only for custom plugins)' },
          handler_code: { type: 'string', description: 'Bash script code for the handler (only for custom plugins). Receives JSON input as $1.' },
          input_schema: { type: 'object', description: 'JSON Schema for plugin inputs (only for custom plugins)' },
          dependencies: { type: 'array', items: { type: 'string' }, description: 'System packages to install (only for custom plugins)' },
        },
        required: ['name'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'plugin_list',
      description: 'List all installed plugins with their status and details.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'plugin_uninstall',
      description: 'Remove an installed plugin.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the plugin to uninstall' },
        },
        required: ['name'],
      },
    },
  },
  // ===== BACKUP =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'backup_create',
      description: 'Create a backup of all agent data (memory, reminders, routines, conversations, user profile). Saves to internal and external storage.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'backup_list',
      description: 'List all available backups with their timestamps and sizes.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'backup_restore',
      description: 'Restore agent data from a backup. Without a backup_id, restores the latest backup. Requires server restart after restore.',
      input_schema: {
        type: 'object',
        properties: {
          backup_id: { type: 'string', description: 'Specific backup ID to restore (e.g. "backup-2024-01-15T10-30-00"). Leave empty for latest.' },
        },
      },
    },
  },
  // ===== VOICE MODE =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'voice_chat',
      description: 'Start or stop voice conversation mode. In voice mode: the phone listens via microphone (STT), sends to agent, and speaks the response (TTS). Say "עצור" or "stop" to end.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"start" to begin voice mode, "stop" to end it', enum: ['start', 'stop'] },
        },
        required: ['action'],
      },
    },
  },
  // ===== GOOGLE SERVICES =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'google_status',
      description: 'Check if Google account is connected. Returns auth status and login URL if needed.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  // --- Gmail ---
  {
    dangerLevel: 'safe',
    definition: {
      name: 'gmail_list',
      description: 'List recent Gmail messages. Optionally filter with a Gmail search query (e.g. "is:unread", "from:john", "subject:invoice").',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g. "is:unread", "from:boss", "subject:meeting"). Default: inbox' },
          max_results: { type: 'number', description: 'Max messages to return (default 10)' },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'gmail_read',
      description: 'Read the full content of a specific Gmail message by its ID.',
      input_schema: {
        type: 'object',
        properties: {
          message_id: { type: 'string', description: 'Gmail message ID' },
        },
        required: ['message_id'],
      },
    },
  },
  {
    dangerLevel: 'dangerous',
    definition: {
      name: 'gmail_send',
      description: 'Send an email via Gmail. Requires user approval.',
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body text' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'gmail_search',
      description: 'Search Gmail with advanced query. Same as gmail_list but semantic alias.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'gmail_mark_read',
      description: 'Mark a Gmail message as read.',
      input_schema: {
        type: 'object',
        properties: {
          message_id: { type: 'string', description: 'Gmail message ID to mark as read' },
        },
        required: ['message_id'],
      },
    },
  },
  // --- Google Drive ---
  {
    dangerLevel: 'safe',
    definition: {
      name: 'drive_list',
      description: 'List recent files in Google Drive. Optionally filter by name.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by file name' },
          max_results: { type: 'number', description: 'Max files (default 15)' },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'drive_search',
      description: 'Search Google Drive files by name.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term' },
        },
        required: ['query'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'drive_get',
      description: 'Get details and content of a specific Google Drive file by ID. Works with Docs and Sheets.',
      input_schema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'Google Drive file ID' },
        },
        required: ['file_id'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'drive_create',
      description: 'Create a new file in Google Drive. Can create Google Docs, Sheets, or plain text files.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'File name' },
          content: { type: 'string', description: 'File content (text for docs, CSV for sheets)' },
          type: { type: 'string', description: 'File type: "doc", "sheet", or "text" (default)', enum: ['doc', 'sheet', 'text'] },
          folder_id: { type: 'string', description: 'Optional folder ID to place the file in' },
        },
        required: ['name', 'content'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'drive_share',
      description: 'Share a Google Drive file with someone via email.',
      input_schema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'File ID to share' },
          email: { type: 'string', description: 'Email address to share with' },
          role: { type: 'string', description: 'Permission role: reader, writer, commenter', enum: ['reader', 'writer', 'commenter'] },
        },
        required: ['file_id', 'email'],
      },
    },
  },
  // --- Google Tasks ---
  {
    dangerLevel: 'safe',
    definition: {
      name: 'google_tasks_list',
      description: 'List all Google Tasks (across all task lists).',
      input_schema: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Max tasks per list (default 20)' },
        },
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'google_tasks_add',
      description: 'Add a new task to Google Tasks.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          notes: { type: 'string', description: 'Task notes/details' },
          due_date: { type: 'string', description: 'Due date in ISO format (e.g. 2025-01-20)' },
          tasklist_id: { type: 'string', description: 'Task list ID (optional, uses default)' },
        },
        required: ['title'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'google_tasks_complete',
      description: 'Mark a Google Task as completed.',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          tasklist_id: { type: 'string', description: 'Task list ID (optional)' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'google_tasks_delete',
      description: 'Delete a Google Task.',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          tasklist_id: { type: 'string', description: 'Task list ID (optional)' },
        },
        required: ['task_id'],
      },
    },
  },
  // --- Google Calendar (API) ---
  {
    dangerLevel: 'safe',
    definition: {
      name: 'gcal_list',
      description: 'List upcoming Google Calendar events. More reliable than calendar_list (uses Google API directly).',
      input_schema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days ahead (default 3)' },
          max_results: { type: 'number', description: 'Max events (default 15)' },
        },
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'gcal_add',
      description: 'Add an event to Google Calendar.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          start_time: { type: 'string', description: 'Start time ISO (e.g. 2025-01-15T10:00:00)' },
          end_time: { type: 'string', description: 'End time ISO (optional, default +1h)' },
          location: { type: 'string', description: 'Event location' },
          description: { type: 'string', description: 'Event description' },
        },
        required: ['title', 'start_time'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'gcal_delete',
      description: 'Delete a Google Calendar event by ID.',
      input_schema: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'Calendar event ID' },
        },
        required: ['event_id'],
      },
    },
  },
  // --- Google Contacts ---
  {
    dangerLevel: 'safe',
    definition: {
      name: 'google_contacts',
      description: 'List or search Google Contacts. Returns names, emails, and phone numbers.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search contacts by name (optional — lists recent if empty)' },
          max_results: { type: 'number', description: 'Max contacts (default 20)' },
        },
      },
    },
  },

  // ===== UI AUTOMATOR — SCREEN CONTROL =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'ui_read_screen',
      description: 'Read all visible elements on the phone screen. Returns a list of buttons, text fields, labels with their coordinates. Use this to understand what is currently displayed before interacting.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'ui_current_app',
      description: 'Get the name/package of the currently active app on screen.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'ui_tap',
      description: 'Tap on a screen element. Can tap by coordinates (x,y) or by visible text. Always use ui_read_screen first to know what is on screen.',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate to tap (optional if text provided)' },
          y: { type: 'number', description: 'Y coordinate to tap (optional if text provided)' },
          text: { type: 'string', description: 'Tap on element containing this text (optional if x,y provided)' },
        },
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'ui_type',
      description: 'Type text into the currently focused input field on screen. Tap on the field first if needed.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'ui_swipe',
      description: 'Swipe on the screen in a direction. Useful for scrolling through lists, pages, or dismissing elements.',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Swipe direction' },
        },
        required: ['direction'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'ui_open_app',
      description: 'Open an app by name. Supported names: whatsapp, telegram, waze, maps, chrome, gmail, phone, camera, settings, youtube, spotify, wolt, gett, instagram, facebook, calendar, gallery. Or provide a full package name.',
      input_schema: {
        type: 'object',
        properties: {
          app: { type: 'string', description: 'App name (e.g. "whatsapp") or full package name (e.g. "com.whatsapp")' },
        },
        required: ['app'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'ui_list_apps',
      description: 'List all installed third-party apps on the phone.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'ui_back',
      description: 'Press the Back button on the phone.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'ui_home',
      description: 'Press the Home button — go to home screen.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'ui_screenshot',
      description: 'Take a screenshot of the current screen. Returns base64 image. Use to visually analyze what is on screen with AI.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'ui_wait_for_text',
      description: 'Wait until specific text appears on screen (up to 10 seconds). Useful after opening an app or triggering an action.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to wait for on screen' },
          timeout_ms: { type: 'number', description: 'Max wait time in ms (default 10000)' },
        },
        required: ['text'],
      },
    },
  },

  // ===== FAVORITES — VIP CONTACTS, SHORTCUTS, APPS, LOCATIONS =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'favorites_list',
      description: 'List all favorites or filter by type. Types: vip (VIP contacts), shortcut (quick commands), app (favorite apps), location (saved places). Use to check who is VIP, what shortcuts exist, etc.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['vip', 'shortcut', 'app', 'location'], description: 'Filter by type (optional — lists all if empty)' },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'favorites_add',
      description: 'Add a new favorite. Use this when the user says things like "תוסיף את אמא כ-VIP", "תוסיף קיצור עבודה", etc. Required fields vary by type. For VIP: name, platforms, priority, relationship. For shortcut: trigger, description, actions. For app: name, packageName, alias. For location: name, address.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['vip', 'shortcut', 'app', 'location'], description: 'Type of favorite to add' },
          data: { type: 'object', description: 'The favorite data. Fields depend on type.' },
        },
        required: ['type', 'data'],
      },
    },
  },
  {
    dangerLevel: 'moderate',
    definition: {
      name: 'favorites_remove',
      description: 'Remove a favorite by its ID.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['vip', 'shortcut', 'app', 'location'], description: 'Type of favorite' },
          id: { type: 'string', description: 'ID of the favorite to remove' },
        },
        required: ['type', 'id'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'favorites_find_vip',
      description: 'Search for a VIP contact by name, alias, or phone. Use when the user says "תשלח ליוסי", "תענה לאמא" — find the VIP to know which platform to use.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name, alias, or phone to search' },
        },
        required: ['query'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'favorites_update_vip',
      description: 'Update an existing VIP contact. Provide the VIP ID and the fields to update.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'VIP contact ID' },
          updates: { type: 'object', description: 'Fields to update (e.g. priority, autoReply, platforms, aliases)' },
        },
        required: ['id', 'updates'],
      },
    },
  },
  // ===== NEW UTILITY TOOLS =====
  {
    dangerLevel: 'safe',
    definition: {
      name: 'weather',
      description: 'Get current weather and forecast for a location. Uses wttr.in free API. Default location is Tel Aviv.',
      input_schema: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name (e.g. "Tel Aviv", "Jerusalem", "Haifa")' },
          lang: { type: 'string', description: 'Language for output: he (Hebrew, default), en (English)' },
        },
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'translate',
      description: 'Translate text between languages using LibreTranslate-compatible API or fallback. Auto-detects source language.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          to: { type: 'string', description: 'Target language code (e.g. "he", "en", "ar", "ru", "fr")' },
          from: { type: 'string', description: 'Source language code (optional, auto-detected if omitted)' },
        },
        required: ['text', 'to'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'summarize_url',
      description: 'Fetch a web page and return a concise summary of its content. Great for articles, news, blog posts.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch and summarize' },
          max_length: { type: 'number', description: 'Max summary length in chars (default 500)' },
        },
        required: ['url'],
      },
    },
  },
  {
    dangerLevel: 'safe',
    definition: {
      name: 'quick_note',
      description: 'Save or retrieve quick notes. Notes are saved to ~/.ai-agent/notes.json. Great for "save this for later" requests.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"add" to save a new note, "list" to show all notes, "search" to find notes, "delete" to remove a note' },
          text: { type: 'string', description: 'Note text (for "add" action)' },
          query: { type: 'string', description: 'Search query (for "search" action)' },
          id: { type: 'string', description: 'Note ID (for "delete" action)' },
          tag: { type: 'string', description: 'Optional tag/category for the note' },
        },
        required: ['action'],
      },
    },
  },
];

// Singleton plugin manager — lazy loaded to avoid circular deps
let _pluginManager: import('../services/plugin-manager').PluginManager | null = null;
function getPluginManager(): import('../services/plugin-manager').PluginManager {
  if (!_pluginManager) {
    const { PluginManager } = require('../services/plugin-manager');
    _pluginManager = new PluginManager();
  }
  return _pluginManager!;
}

export { getPluginManager };

export function getToolDefinitions(): ToolDefinition[] {
  const builtIn = TOOL_DEFINITIONS.map((t) => t.definition);
  const pluginDefs = getPluginManager().getPluginToolDefinitions().map(p => p.definition);
  return [...builtIn, ...pluginDefs];
}

export function getDangerLevel(toolName: string): DangerLevel {
  const tool = TOOL_DEFINITIONS.find((t) => t.definition.name === toolName);
  if (tool) return tool.dangerLevel;
  // Check plugins
  if (toolName.startsWith('plugin_')) {
    const pluginName = toolName.replace('plugin_', '');
    const plugin = getPluginManager().getPlugin(pluginName);
    if (plugin) return plugin.meta.dangerLevel;
  }
  return 'dangerous';
}
