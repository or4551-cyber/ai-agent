'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Star, UserPlus, Zap, Smartphone, MapPin,
  Trash2, ChevronRight, ArrowRight, Phone, Heart,
  Briefcase, Users, Crown, Plus, X, Check
} from 'lucide-react';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002';
const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts?.headers },
  });
  return res.json();
}

type Tab = 'vip' | 'shortcuts' | 'apps' | 'locations';

const TAB_CONFIG: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'vip', label: 'VIP', icon: <Crown size={16} /> },
  { id: 'shortcuts', label: 'קיצורים', icon: <Zap size={16} /> },
  { id: 'apps', label: 'אפליקציות', icon: <Smartphone size={16} /> },
  { id: 'locations', label: 'מיקומים', icon: <MapPin size={16} /> },
];

const RELATIONSHIP_ICONS: Record<string, React.ReactNode> = {
  family: <Heart size={14} className="text-red-400" />,
  partner: <Heart size={14} className="text-pink-400" />,
  friend: <Users size={14} className="text-blue-400" />,
  work: <Briefcase size={14} className="text-amber-400" />,
  other: <Star size={14} className="text-zinc-400" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-green-500',
};

interface VipContact {
  id: string; name: string; phone?: string; platforms: string[]; priority: string;
  relationship: string; aliases: string[]; ringOnSilent: boolean; autoReply?: string;
}

interface QuickShortcut {
  id: string; trigger: string; description: string; actions: string[];
}

interface FavoriteApp {
  id: string; name: string; alias: string; packageName: string;
}

interface FavoriteLocation {
  id: string; name: string; address: string; rules?: string;
}

// ===== ADD VIP FORM =====
function AddVipForm({ onAdd, onClose }: { onAdd: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('friend');
  const [priority, setPriority] = useState('normal');
  const [platforms, setPlatforms] = useState<string[]>(['whatsapp']);
  const [aliases, setAliases] = useState('');

  const submit = async () => {
    if (!name) return;
    await apiFetch('/api/favorites/vip', {
      method: 'POST',
      body: JSON.stringify({
        name, phone, relationship, priority, platforms,
        aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
        ringOnSilent: priority === 'urgent',
      }),
    });
    onAdd();
    onClose();
  };

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const allPlatforms = ['whatsapp', 'instagram', 'facebook', 'telegram', 'sms', 'calls', 'email'];

  return (
    <div className="bg-zinc-800/80 rounded-2xl p-4 border border-zinc-700/50 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">הוספת VIP חדש</span>
        <button onClick={onClose} className="text-zinc-500"><X size={18} /></button>
      </div>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="שם" className="w-full bg-zinc-900 text-white text-sm rounded-xl px-3 py-2 border border-zinc-700" />
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="טלפון (אופציונלי)" className="w-full bg-zinc-900 text-white text-sm rounded-xl px-3 py-2 border border-zinc-700" />
      <input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="כינויים (מופרדים בפסיק)" className="w-full bg-zinc-900 text-white text-sm rounded-xl px-3 py-2 border border-zinc-700" />

      <div>
        <span className="text-[11px] text-zinc-400 block mb-1">יחס</span>
        <div className="flex gap-2 flex-wrap">
          {['family', 'partner', 'friend', 'work', 'other'].map(r => (
            <button key={r} onClick={() => setRelationship(r)}
              className={`text-xs px-3 py-1 rounded-full border ${relationship === r ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10' : 'border-zinc-700 text-zinc-400'}`}>
              {r === 'family' ? 'משפחה' : r === 'partner' ? 'בן/בת זוג' : r === 'friend' ? 'חבר' : r === 'work' ? 'עבודה' : 'אחר'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[11px] text-zinc-400 block mb-1">עדיפות</span>
        <div className="flex gap-2">
          {['urgent', 'high', 'normal'].map(p => (
            <button key={p} onClick={() => setPriority(p)}
              className={`text-xs px-3 py-1 rounded-full border ${priority === p ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10' : 'border-zinc-700 text-zinc-400'}`}>
              {p === 'urgent' ? '🔴 דחוף' : p === 'high' ? '🟡 גבוה' : '🟢 רגיל'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[11px] text-zinc-400 block mb-1">פלטפורמות</span>
        <div className="flex gap-1.5 flex-wrap">
          {allPlatforms.map(p => (
            <button key={p} onClick={() => togglePlatform(p)}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${platforms.includes(p) ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-zinc-700 text-zinc-500'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <button onClick={submit} disabled={!name}
        className="w-full py-2.5 rounded-xl bg-[var(--primary)] text-black text-sm font-bold disabled:opacity-40">
        <Check size={16} className="inline mr-1" /> הוסף VIP
      </button>
    </div>
  );
}

// ===== MAIN PAGE =====
export default function FavoritesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('vip');
  const [vips, setVips] = useState<VipContact[]>([]);
  const [shortcuts, setShortcuts] = useState<QuickShortcut[]>([]);
  const [apps, setApps] = useState<FavoriteApp[]>([]);
  const [locations, setLocations] = useState<FavoriteLocation[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [stats, setStats] = useState({ vip: 0, shortcuts: 0, apps: 0, locations: 0, total: 0 });

  const load = useCallback(async () => {
    try {
      const [data, statsData] = await Promise.all([
        apiFetch('/api/favorites'),
        apiFetch('/api/favorites/stats'),
      ]);
      setVips(data.vip || []);
      setShortcuts(data.shortcuts || []);
      setApps(data.apps || []);
      setLocations(data.locations || []);
      setStats(statsData);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteItem = async (type: string, id: string) => {
    await apiFetch(`/api/favorites/${type}/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 pb-24" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-lg border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-zinc-400 text-sm">חזרה</button>
          <div className="flex items-center gap-2">
            <Star size={18} className="text-amber-400" />
            <span className="text-white font-bold">מועדפים</span>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{stats.total}</span>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center">
            <Plus size={16} className="text-black" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-3">
          {TAB_CONFIG.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                tab === t.id ? 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30' : 'bg-zinc-800/50 text-zinc-500'
              }`}>
              {t.icon} {t.label}
              {t.id === 'vip' && stats.vip > 0 && <span className="text-[10px] bg-zinc-700 px-1.5 rounded-full">{stats.vip}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Add form */}
        {showAdd && tab === 'vip' && <AddVipForm onAdd={load} onClose={() => setShowAdd(false)} />}

        {/* VIP Tab */}
        {tab === 'vip' && (
          vips.length === 0 ? (
            <div className="text-center py-12">
              <Crown size={40} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">אין אנשי קשר VIP עדיין</p>
              <p className="text-zinc-600 text-xs mt-1">הוסף VIP כדי שמרלין ייתן להם עדיפות</p>
              <button onClick={() => setShowAdd(true)} className="mt-4 px-4 py-2 rounded-xl bg-[var(--primary)] text-black text-sm font-bold">
                <UserPlus size={14} className="inline mr-1" /> הוסף VIP
              </button>
            </div>
          ) : (
            vips.map(v => (
              <div key={v.id} className="bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/30">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      v.priority === 'urgent' ? 'bg-red-500/20' : v.priority === 'high' ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                    }`}>
                      {RELATIONSHIP_ICONS[v.relationship] || <Star size={16} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">{v.name}</span>
                        <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[v.priority]}`} />
                      </div>
                      {v.aliases.length > 0 && (
                        <span className="text-zinc-500 text-[11px]">{v.aliases.join(', ')}</span>
                      )}
                      {v.phone && <span className="text-zinc-500 text-[11px] block">{v.phone}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteItem('vip', v.id)} className="text-zinc-600 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {v.platforms.map(p => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400">{p}</span>
                  ))}
                  {v.ringOnSilent && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">🔔 צלצול בשקט</span>}
                </div>
              </div>
            ))
          )
        )}

        {/* Shortcuts Tab */}
        {tab === 'shortcuts' && (
          shortcuts.length === 0 ? (
            <div className="text-center py-12">
              <Zap size={40} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">אין פקודות מהירות</p>
              <p className="text-zinc-600 text-xs mt-1">אמור למרלין: "תוסיף קיצור עבודה"</p>
            </div>
          ) : (
            shortcuts.map(s => (
              <div key={s.id} className="bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" />
                    <span className="text-white font-bold text-sm">"{s.trigger}"</span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-1">{s.description}</p>
                </div>
                <button onClick={() => deleteItem('shortcut', s.id)} className="text-zinc-600 hover:text-red-400 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )
        )}

        {/* Apps Tab */}
        {tab === 'apps' && (
          apps.length === 0 ? (
            <div className="text-center py-12">
              <Smartphone size={40} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">אין אפליקציות מועדפות</p>
              <p className="text-zinc-600 text-xs mt-1">אמור למרלין: "תוסיף את וואטסאפ כמועדף"</p>
            </div>
          ) : (
            apps.map(a => (
              <div key={a.id} className="bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/30 flex items-center justify-between">
                <div>
                  <span className="text-white font-bold text-sm">{a.alias}</span>
                  <span className="text-zinc-500 text-xs block">{a.name} — {a.packageName}</span>
                </div>
                <button onClick={() => deleteItem('app', a.id)} className="text-zinc-600 hover:text-red-400 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )
        )}

        {/* Locations Tab */}
        {tab === 'locations' && (
          locations.length === 0 ? (
            <div className="text-center py-12">
              <MapPin size={40} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">אין מיקומים מועדפים</p>
              <p className="text-zinc-600 text-xs mt-1">אמור למרלין: "תוסיף בית כמיקום מועדף"</p>
            </div>
          ) : (
            locations.map(l => (
              <div key={l.id} className="bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-blue-400" />
                    <span className="text-white font-bold text-sm">{l.name}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">{l.address}</span>
                  {l.rules && <span className="text-zinc-600 text-[10px] block">{l.rules}</span>}
                </div>
                <button onClick={() => deleteItem('location', l.id)} className="text-zinc-600 hover:text-red-400 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
