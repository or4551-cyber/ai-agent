import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

// ===== TYPES =====

export type FavoriteType = 'vip' | 'shortcut' | 'app' | 'location';
export type VipPriority = 'urgent' | 'high' | 'normal';
export type VipRelationship = 'family' | 'partner' | 'friend' | 'work' | 'other';
export type VipPlatform = 'whatsapp' | 'instagram' | 'facebook' | 'telegram' | 'sms' | 'calls' | 'email';

export interface VipContact {
  id: string;
  type: 'vip';
  name: string;
  phone?: string;
  email?: string;
  platforms: VipPlatform[];
  priority: VipPriority;
  ringOnSilent: boolean;
  autoReply?: string;
  relationship: VipRelationship;
  aliases: string[]; // nicknames: "אמא", "mom", etc.
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuickShortcut {
  id: string;
  type: 'shortcut';
  trigger: string; // "קפה", "עבודה", "לילה"
  description: string;
  actions: string[]; // array of commands to execute in order
  context?: {
    hours?: number[];
    days?: number[]; // 0=Sunday
    location?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteApp {
  id: string;
  type: 'app';
  name: string;
  packageName: string;
  alias: string; // "וואטסאפ", "בנק"
  voiceShortcut?: string;
  contextRules?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteLocation {
  id: string;
  type: 'location';
  name: string; // "בית", "עבודה"
  address: string;
  rules?: string; // "כשאני מגיע → הפעל WiFi"
  createdAt: string;
  updatedAt: string;
}

export type Favorite = VipContact | QuickShortcut | FavoriteApp | FavoriteLocation;

interface FavoritesData {
  vip: VipContact[];
  shortcuts: QuickShortcut[];
  apps: FavoriteApp[];
  locations: FavoriteLocation[];
}

const EMPTY_DATA: FavoritesData = {
  vip: [],
  shortcuts: [],
  apps: [],
  locations: [],
};

// ===== SERVICE =====

export class FavoritesService {
  private data: FavoritesData;

  constructor() {
    this.ensureDir();
    this.data = this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): FavoritesData {
    try {
      if (fs.existsSync(FAVORITES_FILE)) {
        const raw = JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf-8'));
        return { ...EMPTY_DATA, ...raw };
      }
    } catch {}
    return { ...EMPTY_DATA };
  }

  private save(): void {
    try {
      fs.writeFileSync(FAVORITES_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Favorites] Save error:', (err as Error).message);
    }
  }

  private genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ===== VIP CONTACTS =====

  addVip(contact: Omit<VipContact, 'id' | 'type' | 'createdAt' | 'updatedAt'>): VipContact {
    const now = new Date().toISOString();
    const vip: VipContact = {
      ...contact,
      id: this.genId(),
      type: 'vip',
      createdAt: now,
      updatedAt: now,
    };
    this.data.vip.push(vip);
    this.save();
    return vip;
  }

  updateVip(id: string, updates: Partial<VipContact>): VipContact | null {
    const idx = this.data.vip.findIndex(v => v.id === id);
    if (idx === -1) return null;
    this.data.vip[idx] = { ...this.data.vip[idx], ...updates, updatedAt: new Date().toISOString() };
    this.save();
    return this.data.vip[idx];
  }

  removeVip(id: string): boolean {
    const before = this.data.vip.length;
    this.data.vip = this.data.vip.filter(v => v.id !== id);
    if (this.data.vip.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  getVipList(): VipContact[] {
    return this.data.vip;
  }

  findVip(query: string): VipContact | null {
    const q = query.toLowerCase();
    return this.data.vip.find(v =>
      v.name.toLowerCase().includes(q) ||
      v.aliases.some(a => a.toLowerCase().includes(q)) ||
      (v.phone && v.phone.includes(q))
    ) || null;
  }

  // ===== QUICK SHORTCUTS =====

  addShortcut(shortcut: Omit<QuickShortcut, 'id' | 'type' | 'createdAt' | 'updatedAt'>): QuickShortcut {
    const now = new Date().toISOString();
    const s: QuickShortcut = {
      ...shortcut,
      id: this.genId(),
      type: 'shortcut',
      createdAt: now,
      updatedAt: now,
    };
    this.data.shortcuts.push(s);
    this.save();
    return s;
  }

  removeShortcut(id: string): boolean {
    const before = this.data.shortcuts.length;
    this.data.shortcuts = this.data.shortcuts.filter(s => s.id !== id);
    if (this.data.shortcuts.length < before) { this.save(); return true; }
    return false;
  }

  getShortcuts(): QuickShortcut[] {
    return this.data.shortcuts;
  }

  findShortcut(trigger: string): QuickShortcut | null {
    const t = trigger.toLowerCase();
    return this.data.shortcuts.find(s => s.trigger.toLowerCase() === t) || null;
  }

  // ===== FAVORITE APPS =====

  addApp(app: Omit<FavoriteApp, 'id' | 'type' | 'createdAt' | 'updatedAt'>): FavoriteApp {
    const now = new Date().toISOString();
    const a: FavoriteApp = {
      ...app,
      id: this.genId(),
      type: 'app',
      createdAt: now,
      updatedAt: now,
    };
    this.data.apps.push(a);
    this.save();
    return a;
  }

  removeApp(id: string): boolean {
    const before = this.data.apps.length;
    this.data.apps = this.data.apps.filter(a => a.id !== id);
    if (this.data.apps.length < before) { this.save(); return true; }
    return false;
  }

  getApps(): FavoriteApp[] {
    return this.data.apps;
  }

  findApp(query: string): FavoriteApp | null {
    const q = query.toLowerCase();
    return this.data.apps.find(a =>
      a.name.toLowerCase().includes(q) ||
      a.alias.toLowerCase().includes(q) ||
      (a.voiceShortcut && a.voiceShortcut.toLowerCase().includes(q))
    ) || null;
  }

  // ===== FAVORITE LOCATIONS =====

  addLocation(loc: Omit<FavoriteLocation, 'id' | 'type' | 'createdAt' | 'updatedAt'>): FavoriteLocation {
    const now = new Date().toISOString();
    const l: FavoriteLocation = {
      ...loc,
      id: this.genId(),
      type: 'location',
      createdAt: now,
      updatedAt: now,
    };
    this.data.locations.push(l);
    this.save();
    return l;
  }

  removeLocation(id: string): boolean {
    const before = this.data.locations.length;
    this.data.locations = this.data.locations.filter(l => l.id !== id);
    if (this.data.locations.length < before) { this.save(); return true; }
    return false;
  }

  getLocations(): FavoriteLocation[] {
    return this.data.locations;
  }

  // ===== GETTERS =====

  getAll(): FavoritesData {
    return this.data;
  }

  getByType(type: FavoriteType): Favorite[] {
    switch (type) {
      case 'vip': return this.data.vip;
      case 'shortcut': return this.data.shortcuts;
      case 'app': return this.data.apps;
      case 'location': return this.data.locations;
    }
  }

  // ===== CONTEXT FOR SYSTEM PROMPT =====

  toContextString(): string {
    const lines: string[] = [];

    // VIP contacts
    if (this.data.vip.length > 0) {
      lines.push('\n## אנשי קשר VIP:');
      for (const v of this.data.vip) {
        const platforms = v.platforms.join(', ');
        const aliases = v.aliases.length > 0 ? ` (${v.aliases.join(', ')})` : '';
        const priority = v.priority === 'urgent' ? '🔴' : v.priority === 'high' ? '🟡' : '🟢';
        lines.push(`${priority} ${v.name}${aliases} — ${v.relationship} | ${platforms}${v.phone ? ' | ' + v.phone : ''}${v.autoReply ? ' | תגובה אוטומטית: "' + v.autoReply + '"' : ''}`);
      }
    }

    // Quick shortcuts
    if (this.data.shortcuts.length > 0) {
      lines.push('\n## פקודות מהירות:');
      for (const s of this.data.shortcuts) {
        lines.push(`- "${s.trigger}" → ${s.description}`);
      }
    }

    // Favorite apps
    if (this.data.apps.length > 0) {
      lines.push('\n## אפליקציות מועדפות:');
      for (const a of this.data.apps) {
        lines.push(`- ${a.alias} (${a.name}) — ${a.packageName}`);
      }
    }

    // Locations
    if (this.data.locations.length > 0) {
      lines.push('\n## מיקומים מועדפים:');
      for (const l of this.data.locations) {
        lines.push(`- ${l.name}: ${l.address}${l.rules ? ' | ' + l.rules : ''}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  // ===== STATS =====

  getStats(): { vip: number; shortcuts: number; apps: number; locations: number; total: number } {
    return {
      vip: this.data.vip.length,
      shortcuts: this.data.shortcuts.length,
      apps: this.data.apps.length,
      locations: this.data.locations.length,
      total: this.data.vip.length + this.data.shortcuts.length + this.data.apps.length + this.data.locations.length,
    };
  }
}
