import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ToolDefinition, DangerLevel } from '../types';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const PLUGINS_DIR = path.join(DATA_DIR, 'plugins');

export interface PluginMeta {
  name: string;
  description: string;
  version: string;
  author: string;
  dangerLevel: DangerLevel;
  definition: ToolDefinition;
  installedAt: string;
  source: 'catalog' | 'custom' | 'ai-generated';
  dependencies?: string[];
}

export interface PluginInfo {
  meta: PluginMeta;
  handlerPath: string;
  enabled: boolean;
}

export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();

  constructor() {
    this.ensureDir();
    this.loadAll();
  }

  private ensureDir(): void {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    }
  }

  private loadAll(): void {
    try {
      const entries = fs.readdirSync(PLUGINS_DIR);
      for (const entry of entries) {
        const pluginDir = path.join(PLUGINS_DIR, entry);
        if (!fs.statSync(pluginDir).isDirectory()) continue;
        try {
          this.loadPlugin(pluginDir);
        } catch (err) {
          console.error(`[Plugins] Failed to load ${entry}:`, (err as Error).message);
        }
      }
      console.log(`[Plugins] Loaded ${this.plugins.size} plugins`);
    } catch {}
  }

  private loadPlugin(pluginDir: string): void {
    const metaPath = path.join(pluginDir, 'plugin.json');
    const handlerPath = path.join(pluginDir, 'handler.sh');

    if (!fs.existsSync(metaPath)) return;

    const meta: PluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    
    this.plugins.set(meta.name, {
      meta,
      handlerPath,
      enabled: true,
    });
  }

  install(
    name: string,
    description: string,
    handlerCode: string,
    inputSchema: Record<string, unknown>,
    options: {
      dangerLevel?: DangerLevel;
      version?: string;
      author?: string;
      source?: 'catalog' | 'custom' | 'ai-generated';
      dependencies?: string[];
    } = {}
  ): string {
    const pluginDir = path.join(PLUGINS_DIR, name);
    
    // Check if already installed
    if (this.plugins.has(name)) {
      return `⚠️ פלגין "${name}" כבר מותקן. השתמש ב-plugin_uninstall קודם אם רוצה להתקין מחדש.`;
    }

    try {
      fs.mkdirSync(pluginDir, { recursive: true });

      // Install dependencies if needed
      if (options.dependencies && options.dependencies.length > 0) {
        for (const dep of options.dependencies) {
          try {
            execSync(`which ${dep} 2>/dev/null || pkg install -y ${dep} 2>/dev/null`, { timeout: 60000 });
          } catch {
            // Try pip as fallback
            try {
              execSync(`pip install ${dep} 2>/dev/null`, { timeout: 60000 });
            } catch {}
          }
        }
      }

      const meta: PluginMeta = {
        name,
        description,
        version: options.version || '1.0.0',
        author: options.author || 'ai-agent',
        dangerLevel: options.dangerLevel || 'safe',
        definition: {
          name: `plugin_${name}`,
          description,
          input_schema: inputSchema as ToolDefinition['input_schema'],
        },
        installedAt: new Date().toISOString(),
        source: options.source || 'custom',
        dependencies: options.dependencies,
      };

      // Write metadata
      fs.writeFileSync(
        path.join(pluginDir, 'plugin.json'),
        JSON.stringify(meta, null, 2),
        'utf-8'
      );

      // Write handler script
      fs.writeFileSync(
        path.join(pluginDir, 'handler.sh'),
        handlerCode,
        { encoding: 'utf-8', mode: 0o755 }
      );

      // Make executable
      try {
        execSync(`chmod +x "${path.join(pluginDir, 'handler.sh')}" 2>/dev/null`, { timeout: 3000 });
      } catch {}

      // Load into memory
      this.plugins.set(name, {
        meta,
        handlerPath: path.join(pluginDir, 'handler.sh'),
        enabled: true,
      });

      return [
        `✅ פלגין "${name}" הותקן בהצלחה!`,
        `📝 ${description}`,
        `🔧 כלי חדש: plugin_${name}`,
        `📂 ${pluginDir}`,
        options.dependencies?.length ? `📦 תלויות: ${options.dependencies.join(', ')}` : '',
      ].filter(Boolean).join('\n');
    } catch (err) {
      // Cleanup on failure
      try { fs.rmSync(pluginDir, { recursive: true }); } catch {}
      return `❌ שגיאה בהתקנת פלגין: ${(err as Error).message}`;
    }
  }

  uninstall(name: string): string {
    if (!this.plugins.has(name)) {
      return `⚠️ פלגין "${name}" לא נמצא.`;
    }

    try {
      const pluginDir = path.join(PLUGINS_DIR, name);
      fs.rmSync(pluginDir, { recursive: true });
      this.plugins.delete(name);
      return `✅ פלגין "${name}" הוסר בהצלחה.`;
    } catch (err) {
      return `❌ שגיאה בהסרת פלגין: ${(err as Error).message}`;
    }
  }

  async execute(name: string, input: Record<string, unknown>): Promise<string> {
    const plugin = this.plugins.get(name);
    if (!plugin) return `❌ פלגין "${name}" לא נמצא.`;
    if (!plugin.enabled) return `⏸️ פלגין "${name}" מושבת.`;

    try {
      const inputJson = JSON.stringify(input);
      const result = execSync(
        `bash "${plugin.handlerPath}" '${inputJson.replace(/'/g, "'\\''")}'`,
        { timeout: 30000, encoding: 'utf-8' }
      );
      return result.trim() || '(no output)';
    } catch (err) {
      const error = err as { stderr?: string; message: string };
      return `❌ שגיאת פלגין "${name}": ${error.stderr || error.message}`;
    }
  }

  list(): string {
    if (this.plugins.size === 0) {
      return 'אין פלגינים מותקנים. השתמש ב-plugin_catalog כדי לראות פלגינים זמינים, או ב-plugin_install כדי ליצור חדש.';
    }

    const lines: string[] = [];
    for (const [name, info] of this.plugins) {
      const status = info.enabled ? '🟢' : '🔴';
      lines.push(
        `${status} **${name}** v${info.meta.version}` +
        `\n   ${info.meta.description}` +
        `\n   מקור: ${info.meta.source} | כלי: plugin_${name} | הותקן: ${info.meta.installedAt.slice(0, 10)}`
      );
    }
    return lines.join('\n\n');
  }

  getPluginToolDefinitions(): { definition: ToolDefinition; dangerLevel: DangerLevel }[] {
    const defs: { definition: ToolDefinition; dangerLevel: DangerLevel }[] = [];
    for (const [, info] of this.plugins) {
      if (info.enabled) {
        defs.push({
          definition: info.meta.definition,
          dangerLevel: info.meta.dangerLevel,
        });
      }
    }
    return defs;
  }

  isPluginTool(toolName: string): boolean {
    if (!toolName.startsWith('plugin_')) return false;
    const name = toolName.replace('plugin_', '');
    return this.plugins.has(name);
  }

  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  getPlugin(name: string): PluginInfo | undefined {
    return this.plugins.get(name);
  }
}
