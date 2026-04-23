'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Folder, FileText, ChevronLeft, RefreshCw, Home,
  Trash2, FilePlus, FolderPlus, Save, X, Loader2
} from 'lucide-react';
import { listFiles, readFileContent, writeFileContent, FileItem, DirListing } from '@/lib/api';

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'md'];
  if (codeExts.includes(ext || '')) return '📄';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) return '🖼️';
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext || '')) return '🎬';
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext || '')) return '🎵';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext || '')) return '📦';
  if (['pdf'].includes(ext || '')) return '📕';
  return '📄';
}

export default function FileExplorer() {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; original: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError('');
    setEditingFile(null);
    try {
      const data = await listFiles(dirPath);
      setListing(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDir();
  }, [loadDir]);

  const openFile = async (item: FileItem) => {
    if (item.isDirectory) {
      loadDir(item.path);
      return;
    }
    setFileLoading(true);
    try {
      const data = await readFileContent(item.path);
      setEditingFile({ path: data.path, content: data.content, original: data.content });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFileLoading(false);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    setSaving(true);
    try {
      await writeFileContent(editingFile.path, editingFile.content);
      setEditingFile({ ...editingFile, original: editingFile.content });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = editingFile ? editingFile.content !== editingFile.original : false;

  // ===== CODE EDITOR VIEW =====
  if (editingFile) {
    const fileName = editingFile.path.split(/[\\/]/).pop() || '';
    return (
      <div className="flex flex-col h-full">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setEditingFile(null)} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
              <X size={18} />
            </button>
            <span className="text-sm font-medium truncate">{fileName}</span>
            {hasChanges && <span className="text-xs text-yellow-400 shrink-0">● unsaved</span>}
          </div>
          <button
            onClick={saveFile}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>

        {/* Editor */}
        <textarea
          value={editingFile.content}
          onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
          spellCheck={false}
          className="flex-1 w-full p-4 bg-[#0d0d1a] text-[#e0e0e0] text-sm font-mono leading-relaxed resize-none focus:outline-none"
        />
      </div>
    );
  }

  // ===== FILE LIST VIEW =====
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <button
          onClick={() => listing?.parent && loadDir(listing.parent)}
          disabled={!listing?.parent || listing.path === listing.parent}
          className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => loadDir()} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
          <Home size={18} />
        </button>
        <div className="flex-1 text-xs text-[var(--muted-foreground)] font-mono truncate px-2">
          {listing?.path || '...'}
        </div>
        <button onClick={() => loadDir(listing?.path)} className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 text-red-400 text-xs border-b border-red-500/20">
          {error}
        </div>
      )}

      {/* Loading */}
      {(loading || fileLoading) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
        </div>
      )}

      {/* File List */}
      {!loading && !fileLoading && listing && (
        <div className="flex-1 overflow-y-auto">
          {listing.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--muted-foreground)]">
              <Folder size={40} className="opacity-30 mb-3" />
              <p className="text-sm">Empty directory</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {listing.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => openFile(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)] transition-colors text-left"
                >
                  {item.isDirectory ? (
                    <Folder size={20} className="text-blue-400 shrink-0" />
                  ) : (
                    <span className="text-lg shrink-0">{getFileIcon(item.name)}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {item.isDirectory ? 'Folder' : formatSize(item.size)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
