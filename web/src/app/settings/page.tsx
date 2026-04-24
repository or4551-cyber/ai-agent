'use client';

import { useState, useEffect } from 'react';
import { Save, Key, Server, Shield, Brain, Trash2, Wifi, WifiOff, Loader2, Info } from 'lucide-react';
import { useToast } from '@/components/common/Toast';

const MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'חכם ומהיר ($3/$15 למיליון טוקנים)', tier: 'recommended' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', desc: 'דור קודם ($3/$15 למיליון טוקנים)', tier: 'good' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', desc: 'הכי חסכוני ($0.80/$4 למיליון טוקנים)', tier: 'budget' },
];

export default function SettingsPage() {
  const [wsUrl, setWsUrl] = useState('');
  const [token, setToken] = useState('');
  const [model, setModel] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const { toast } = useToast();

  useEffect(() => {
    setWsUrl(localStorage.getItem('ws_url') || '');
    setToken(localStorage.getItem('auth_token') || 'dev-token');
    setModel(localStorage.getItem('ai_model') || 'claude-sonnet-4-20250514');
  }, []);

  const handleSave = () => {
    if (wsUrl) localStorage.setItem('ws_url', wsUrl);
    else localStorage.removeItem('ws_url');
    localStorage.setItem('auth_token', token);
    localStorage.setItem('ai_model', model);
    toast('ההגדרות נשמרו! יש לרענן את הדף.');
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConnectionStatus(res.ok ? 'ok' : 'fail');
      toast(res.ok ? 'החיבור תקין!' : 'שגיאת חיבור', res.ok ? 'success' : 'error');
    } catch {
      setConnectionStatus('fail');
      toast('לא מצליח להתחבר לשרת', 'error');
    }
  };

  const clearHistory = () => {
    if (confirm('למחוק את כל השיחות?')) {
      localStorage.removeItem('ai-agent-conversations');
      toast('ההיסטוריה נמחקה');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="glass px-5 py-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold flex items-center gap-2 tracking-tight">
          <Shield size={20} className="text-[var(--primary)]" /> הגדרות
        </h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Model Selection */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Brain size={15} className="text-[var(--primary)]" />
              מודל AI
            </div>
          </div>
          <div className="p-2 space-y-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full text-right px-3.5 py-3 rounded-xl transition-all ${
                  model === m.id
                    ? 'border border-[var(--primary)]/50 bg-[var(--primary)]/10'
                    : 'hover:bg-[var(--muted)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border-2 ${model === m.id ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--muted-foreground)]'}`} />
                    <span className="text-sm font-medium">{m.name}</span>
                  </div>
                  {m.tier === 'recommended' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">מומלץ</span>
                  )}
                  {m.tier === 'budget' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white">חסכוני</span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 pr-5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Connection */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Server size={15} className="text-purple-400" />
              חיבור
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">WebSocket URL (אופציונלי)</label>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm"
                placeholder="זיהוי אוטומטי"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">טוקן אימות</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm"
                placeholder="your-secret-token"
              />
            </div>
            <button
              onClick={testConnection}
              disabled={connectionStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--muted)] transition-all w-full justify-center"
            >
              {connectionStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> :
               connectionStatus === 'ok' ? <Wifi size={14} className="text-emerald-400" /> :
               connectionStatus === 'fail' ? <WifiOff size={14} className="text-red-400" /> :
               <Wifi size={14} />}
              בדוק חיבור
            </button>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-indigo-600 text-white text-sm font-semibold w-full justify-center shadow-lg shadow-[var(--primary)]/20"
        >
          <Save size={16} />
          שמור הגדרות
        </button>

        {/* Danger Zone */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
              <Trash2 size={15} />
              אזור מסוכן
            </div>
          </div>
          <div className="p-3">
            <button
              onClick={clearHistory}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-400 text-sm hover:bg-red-500/10 transition-all w-full justify-center"
            >
              מחק היסטוריית שיחות
            </button>
          </div>
        </div>

        {/* App Info */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Info size={15} className="text-[var(--muted-foreground)]" />
            אודות
          </div>
          <div className="text-xs text-[var(--muted-foreground)] space-y-1">
            <div>AI Agent v1.0 · מופעל על Termux</div>
            <div>מודל: {MODELS.find(m => m.id === model)?.name || model}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
