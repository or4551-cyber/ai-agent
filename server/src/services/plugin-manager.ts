import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
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

  // ===== PRE-FLIGHT: check if dependencies are available BEFORE installing =====
  private checkDependencies(deps: string[]): { available: string[]; missing: string[]; canAutoInstall: boolean } {
    const available: string[] = [];
    const missing: string[] = [];

    for (const dep of deps) {
      try {
        execSync(`which ${dep} 2>/dev/null`, { timeout: 3000, stdio: 'pipe' });
        available.push(dep);
      } catch {
        missing.push(dep);
      }
    }

    // Check if pkg exists (Termux package manager)
    let canAutoInstall = false;
    if (missing.length > 0) {
      try {
        execSync('which pkg 2>/dev/null', { timeout: 3000, stdio: 'pipe' });
        canAutoInstall = true;
      } catch {}
    }

    return { available, missing, canAutoInstall };
  }

  // Non-blocking dependency install using spawn (won't crash server)
  private installDependencyAsync(dep: string): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve({ success: false, output: `timeout installing ${dep}` });
      }, 120000);

      const child = spawn('pkg', ['install', '-y', dep], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d.toString().slice(-500); });
      child.stderr?.on('data', (d) => { stderr += d.toString().slice(-500); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          success: code === 0,
          output: code === 0 ? stdout.slice(-200) : stderr.slice(-200),
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ success: false, output: err.message });
      });
    });
  }

  async install(
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
  ): Promise<string> {
    const pluginDir = path.join(PLUGINS_DIR, name);

    // === PRE-CHECK 1: Already installed? ===
    if (this.plugins.has(name)) {
      return `⚠️ פלגין "${name}" כבר מותקן. השתמש ב-plugin_uninstall קודם אם רוצה להתקין מחדש.`;
    }

    // === PRE-CHECK 2: Dependencies ===
    const deps = options.dependencies || [];
    const depStatus = deps.length > 0 ? this.checkDependencies(deps) : { available: [], missing: [], canAutoInstall: false };

    if (depStatus.missing.length > 0) {
      if (!depStatus.canAutoInstall) {
        // Can't auto-install — tell the user what to do
        return [
          `❌ לא ניתן להתקין פלגין "${name}" — חסרות תלויות:`,
          `   חסר: ${depStatus.missing.join(', ')}`,
          `   pkg לא זמין להתקנה אוטומטית.`,
          ``,
          `🔧 פתרון — הרץ ידנית ב-Termux:`,
          ...depStatus.missing.map(d => `   pkg install -y ${d}`),
          ``,
          `ואז נסה שוב להתקין את הפלגין.`,
        ].join('\n');
      }

      // Try to auto-install missing deps (non-blocking!)
      console.log(`[Plugins] Installing missing deps for ${name}: ${depStatus.missing.join(', ')}`);
      const results: string[] = [];
      const failures: string[] = [];

      for (const dep of depStatus.missing) {
        const result = await this.installDependencyAsync(dep);
        if (result.success) {
          results.push(`✅ ${dep} הותקן`);
        } else {
          failures.push(dep);
          results.push(`❌ ${dep} נכשל: ${result.output.slice(0, 100)}`);
        }
      }

      if (failures.length > 0) {
        return [
          `❌ התקנת תלויות נכשלה עבור פלגין "${name}":`,
          ...results,
          ``,
          `🔧 פתרון — הרץ ידנית ב-Termux:`,
          ...failures.map(d => `   pkg install -y ${d}`),
          ``,
          `ואז נסה שוב: "תתקין את פלגין ${name}"`,
        ].join('\n');
      }
    }

    // === PRE-CHECK 3: Can write to plugins dir? ===
    try {
      fs.mkdirSync(pluginDir, { recursive: true });
    } catch (err) {
      return `❌ לא ניתן ליצור תיקיית פלגין: ${(err as Error).message}\nבדוק הרשאות ל-${PLUGINS_DIR}`;
    }

    // === ALL CHECKS PASSED — INSTALL ===
    try {
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
        execSync(`chmod +x "${path.join(pluginDir, 'handler.sh')}" 2>/dev/null`, { timeout: 3000, stdio: 'pipe' });
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
        deps.length ? `📦 תלויות: ${deps.join(', ')} (${depStatus.missing.length > 0 ? 'הותקנו עכשיו' : 'כולן זמינות'})` : '',
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
