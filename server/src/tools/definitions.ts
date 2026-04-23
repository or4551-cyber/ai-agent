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
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map((t) => t.definition);
}

export function getDangerLevel(toolName: string): DangerLevel {
  const tool = TOOL_DEFINITIONS.find((t) => t.definition.name === toolName);
  return tool?.dangerLevel ?? 'dangerous';
}
