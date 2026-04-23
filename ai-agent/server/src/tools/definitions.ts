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
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map((t) => t.definition);
}

export function getDangerLevel(toolName: string): DangerLevel {
  const tool = TOOL_DEFINITIONS.find((t) => t.definition.name === toolName);
  return tool?.dangerLevel ?? 'dangerous';
}
