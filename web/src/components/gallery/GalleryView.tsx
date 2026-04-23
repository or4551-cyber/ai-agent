'use client';

import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, X, ChevronLeft, ChevronRight, Loader2, Calendar } from 'lucide-react';
import { listGallery, getImageUrl, GalleryImage } from '@/lib/api';

function groupByDate(images: GalleryImage[]): Map<string, GalleryImage[]> {
  const groups = new Map<string, GalleryImage[]>();
  for (const img of images) {
    const date = img.modified ? new Date(img.modified).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(img);
  }
  return groups;
}

export default function GalleryView() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [galleryPath, setGalleryPath] = useState('');

  useEffect(() => {
    loadGallery();
  }, []);

  const loadGallery = async (path?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await listGallery(path, 200);
      setImages(data.images);
      setGalleryPath(data.path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const navigate = (delta: number) => {
    if (selectedIndex === null) return;
    const next = selectedIndex + delta;
    if (next >= 0 && next < images.length) {
      setSelectedIndex(next);
    }
  };

  // ===== LIGHTBOX WITH SWIPE =====
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.touches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) navigate(1);
      else navigate(-1);
    }
  };

  if (selectedIndex !== null) {
    const img = images[selectedIndex];
    const sizeKb = img.size ? Math.round(img.size / 1024) : null;
    const dateStr = img.modified ? new Date(img.modified).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
        {/* Header */}
        <div className="glass flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="truncate max-w-[65%]">
            <div className="text-sm text-white/90 font-medium truncate">{img.name}</div>
            <div className="text-[10px] text-white/40">{dateStr} {sizeKb ? `· ${sizeKb >= 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB'}` : ''}</div>
          </div>
          <button onClick={() => setSelectedIndex(null)} className="p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10">
            <X size={22} />
          </button>
        </div>

        {/* Image with swipe */}
        <div
          className="flex-1 flex items-center justify-center relative px-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <button
            onClick={() => navigate(-1)}
            disabled={selectedIndex === 0}
            className="absolute left-2 p-2.5 rounded-full bg-black/50 text-white disabled:opacity-10 z-10"
          >
            <ChevronLeft size={22} />
          </button>

          <img
            src={getImageUrl(img.path)}
            alt={img.name}
            className="max-h-[80vh] max-w-full object-contain rounded-lg"
          />

          <button
            onClick={() => navigate(1)}
            disabled={selectedIndex === images.length - 1}
            className="absolute right-2 p-2.5 rounded-full bg-black/50 text-white disabled:opacity-10 z-10"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Counter */}
        <div className="px-4 py-3 text-center">
          <span className="text-xs text-white/50 bg-white/10 px-3 py-1 rounded-full">
            {selectedIndex + 1} / {images.length}
          </span>
        </div>
      </div>
    );
  }

  // ===== GRID VIEW =====
  const grouped = groupByDate(images);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h1 className="text-sm font-bold flex items-center gap-2 tracking-tight">
          <ImageIcon size={18} className="text-[var(--primary)]" /> גלריה
        </h1>
        <span className="text-xs text-[var(--muted-foreground)] font-medium">
          {images.length} תמונות
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 text-center text-sm text-[var(--muted-foreground)]">
          <p className="mb-2">⚠️ {error}</p>
          <p className="text-xs">On phone, images will load from /storage/emulated/0/DCIM</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
        </div>
      )}

      {/* Empty */}
      {!loading && images.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--muted-foreground)] animate-fade-in px-6">
          <div className="w-20 h-20 rounded-3xl bg-[var(--muted)] flex items-center justify-center mb-5">
            <ImageIcon size={36} className="opacity-40" />
          </div>
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-1.5">אין תמונות</h2>
          <p className="text-sm text-center max-w-[260px] leading-relaxed">
            לא נמצאו תמונות ב-{galleryPath}.
            <br />
            תמונות מהטלפון יופיעו כאן אוטומטית.
          </p>
        </div>
      )}

      {/* Photo Grid */}
      {!loading && images.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3">
          {Array.from(grouped.entries()).map(([date, imgs]) => (
            <div key={date} className="mb-6">
              <div className="flex items-center gap-2 mb-2 text-xs text-[var(--muted-foreground)] font-medium">
                <Calendar size={14} />
                {date}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
                {imgs.map((img) => {
                  const globalIdx = images.indexOf(img);
                  return (
                    <button
                      key={img.path}
                      onClick={() => setSelectedIndex(globalIdx)}
                      className="aspect-square rounded-xl overflow-hidden bg-[var(--muted)] hover:opacity-80 active:scale-95 transition-all"
                    >
                      <img
                        src={getImageUrl(img.path)}
                        alt={img.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
