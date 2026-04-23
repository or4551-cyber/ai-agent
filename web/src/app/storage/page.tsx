'use client';

import { useState, useEffect } from 'react';
import {
  getLastScan, startStorageScan, clearCache, deleteEmptyFolders, deleteFiles,
  ScanResult,
} from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import {
  HardDrive, Loader2, Trash2, FolderOpen, Copy, FileWarning,
  Zap, RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';

export default function StoragePage() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>('large');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    getLastScan()
      .then(r => setScan(r.result))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await startStorageScan();
      setScan(r.result);
      toast('הסריקה הושלמה!', 'success');
    } catch (err) {
      toast('שגיאה בסריקה', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleClearCache = async () => {
    setActionLoading('cache');
    try {
      const r = await clearCache();
      toast(`נוקו ${r.freedMb} MB של cache`, 'success');
      runScan(); // Rescan
    } catch { toast('שגיאה', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleDeleteEmpty = async () => {
    setActionLoading('empty');
    try {
      const r = await deleteEmptyFolders();
      toast(`נמחקו ${r.deleted} תיקיות ריקות`, 'success');
    } catch { toast('שגיאה', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleDeleteFiles = async (paths: string[], label: string) => {
    if (!confirm(`למחוק ${paths.length} קבצים (${label})?`)) return;
    setActionLoading(label);
    try {
      const r = await deleteFiles(paths);
      toast(`נמחקו ${r.deleted} קבצים`, 'success');
      runScan(); // Rescan
    } catch { toast('שגיאה', 'error'); }
    finally { setActionLoading(null); }
  };

  const toggle = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="glass px-5 py-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold flex items-center gap-2 tracking-tight">
          <HardDrive size={20} className="text-[var(--primary)]" /> ניהול אחסון
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Scan button */}
        {!scan && (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-[var(--muted)] flex items-center justify-center mb-5">
              <HardDrive size={36} className="opacity-40" />
            </div>
            <h2 className="text-lg font-bold mb-1.5">סרוק את האחסון</h2>
            <p className="text-sm text-[var(--muted-foreground)] text-center max-w-[260px] mb-6">
              סריקה עמוקה תזהה קבצים כפולים, cache, קבצי זבל וקבצים גדולים
            </p>
            <button
              onClick={runScan}
              disabled={scanning}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-indigo-600 text-white font-semibold shadow-lg shadow-[var(--primary)]/20"
            >
              {scanning ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
              {scanning ? 'סורק...' : 'התחל סריקה'}
            </button>
          </div>
        )}

        {/* Scan results */}
        {scan && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)] text-center">
                <div className="text-lg font-bold">{scan.totalFiles.toLocaleString()}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">קבצים</div>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)] text-center">
                <div className="text-lg font-bold">{scan.freeSpaceMb > 1024 ? `${(scan.freeSpaceMb / 1024).toFixed(1)} GB` : `${scan.freeSpaceMb} MB`}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">מקום פנוי</div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <div className="text-lg font-bold text-emerald-400">{scan.totalSavingsMb > 1024 ? `${(scan.totalSavingsMb / 1024).toFixed(1)} GB` : `${scan.totalSavingsMb} MB`}</div>
                <div className="text-[10px] text-emerald-400/70">חיסכון אפשרי</div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2">
              <button
                onClick={runScan}
                disabled={scanning}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border)] text-xs hover:bg-[var(--muted)]"
              >
                {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                סרוק שוב
              </button>
              <button
                onClick={handleClearCache}
                disabled={actionLoading === 'cache'}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs"
              >
                {actionLoading === 'cache' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                נקה cache
              </button>
              <button
                onClick={handleDeleteEmpty}
                disabled={actionLoading === 'empty'}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs"
              >
                {actionLoading === 'empty' ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                מחק ריקות ({scan.emptyFolders.length})
              </button>
            </div>

            {/* Large Files */}
            {scan.largeFiles.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                <button onClick={() => toggle('large')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--muted)]">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle size={15} className="text-amber-400" />
                    קבצים גדולים ({scan.largeFiles.length})
                  </div>
                  {expandedSection === 'large' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {expandedSection === 'large' && (
                  <div className="divide-y divide-[var(--border)]">
                    {scan.largeFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 group">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="text-xs font-medium truncate">{f.name}</div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">{f.category} · {f.sizeMb} MB</div>
                        </div>
                        <button
                          onClick={() => handleDeleteFiles([f.path], f.name)}
                          className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duplicates */}
            {scan.duplicates.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                <button onClick={() => toggle('dups')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--muted)]">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Copy size={15} className="text-blue-400" />
                    קבצים כפולים ({scan.duplicates.length} קבוצות)
                  </div>
                  {expandedSection === 'dups' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {expandedSection === 'dups' && (
                  <div className="divide-y divide-[var(--border)]">
                    {scan.duplicates.slice(0, 10).map((group, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <div className="text-[10px] text-[var(--muted-foreground)] mb-1">{group.sizeMb} MB · {group.files.length} עותקים</div>
                        {group.files.map((f, j) => (
                          <div key={j} className="text-xs truncate text-[var(--muted-foreground)]">
                            {j === 0 ? '✓ ' : '  '}{f.split('/').slice(-2).join('/')}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Junk Files */}
            {scan.junkFiles.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                <button onClick={() => toggle('junk')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--muted)]">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileWarning size={15} className="text-red-400" />
                    קבצי זבל ({scan.junkFiles.length})
                  </div>
                  {expandedSection === 'junk' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {expandedSection === 'junk' && (
                  <div className="p-4">
                    <button
                      onClick={() => handleDeleteFiles(scan.junkFiles.map(f => f.path), 'junk')}
                      disabled={actionLoading === 'junk'}
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-3"
                    >
                      {actionLoading === 'junk' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      מחק את כל קבצי הזבל ({scan.junkFiles.reduce((s, f) => s + f.sizeMb, 0).toFixed(1)} MB)
                    </button>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {scan.junkFiles.slice(0, 15).map((f, i) => (
                        <div key={i} className="text-[10px] text-[var(--muted-foreground)] truncate">{f.name} ({f.sizeMb}MB)</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scan timestamp */}
            <div className="text-center text-[10px] text-[var(--muted-foreground)] pb-4">
              סריקה אחרונה: {new Date(scan.timestamp).toLocaleString('he-IL')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
