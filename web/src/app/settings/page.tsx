'use client';

import { useState, useEffect } from 'react';
import { Save, Key, Server, Shield, Brain, Trash2 } from 'lucide-react';

const MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Smart & fast ($3/$15 per 1M tokens)', tier: 'recommended' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', desc: 'Previous gen ($3/$15 per 1M tokens)', tier: 'good' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', desc: 'Cheapest ($0.25/$1.25 per 1M tokens)', tier: 'budget' },
];

export default function SettingsPage() {
  const [wsUrl, setWsUrl] = useState('');
  const [token, setToken] = useState('');
  const [model, setModel] = useState('');
  const [saved, setSaved] = useState(false);

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
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clearHistory = () => {
    if (confirm('Delete all saved conversations?')) {
      localStorage.removeItem('ai-agent-conversations');
      alert('History cleared');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Shield size={24} /> Settings
        </h1>

        {/* Model Selection */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Brain size={16} className="text-[var(--muted-foreground)]" />
            AI Model
          </label>
          <div className="space-y-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  model === m.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.name}</span>
                  {m.tier === 'recommended' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">Recommended</span>
                  )}
                  {m.tier === 'budget' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-600 text-white">Budget</span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Server URL */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Server size={16} className="text-[var(--muted-foreground)]" />
            WebSocket URL (optional)
          </label>
          <input
            type="text"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)]"
            placeholder="Auto-detect (leave empty)"
          />
        </div>

        {/* Auth Token */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Key size={16} className="text-[var(--muted-foreground)]" />
            Auth Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)]"
            placeholder="your-secret-token"
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity w-full justify-center"
        >
          <Save size={16} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>

        {/* Clear History */}
        <button
          onClick={clearHistory}
          className="flex items-center gap-2 px-6 py-3 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors w-full justify-center"
        >
          <Trash2 size={16} />
          Clear Chat History
        </button>

        {/* Info */}
        <div className="mt-4 p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--muted-foreground)] space-y-2">
          <p className="font-medium text-[var(--foreground)]">Setup Instructions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Install Termux + Termux:API from F-Droid</li>
            <li>Run the install script in Termux</li>
            <li>Set your Anthropic API key in <code className="bg-black/30 px-1 rounded">.env</code></li>
            <li>Start: <code className="bg-black/30 px-1 rounded">cd ~/ai-agent/server && npm run dev</code></li>
            <li>Open Chrome: <code className="bg-black/30 px-1 rounded">localhost:3002</code></li>
          </ol>
        </div>
      </div>
    </div>
  );
}
