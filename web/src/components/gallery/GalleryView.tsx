'use client';

import { useState, useEffect } from 'react';
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

  // ===== LIGHTBOX =====
  if (selectedIndex !== null) {
    const img = images[selectedIndex];
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-white/70 truncate max-w-[60%]">{img.name}</span>
          <button onClick={() => setSelectedIndex(null)} className="p-2 text-white/70 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center relative px-2">
          <button
            onClick={() => navigate(-1)}
            disabled={selectedIndex === 0}
            className="absolute left-2 p-2 rounded-full bg-black/50 text-white disabled:opacity-20 z-10"
          >
            <ChevronLeft size={24} />
          </button>

          <img
            src={getImageUrl(img.path)}
            alt={img.name}
            className="max-h-[80vh] max-w-full object-contain rounded"
          />

          <button
            onClick={() => navigate(1)}
            disabled={selectedIndex === images.length - 1}
            className="absolute right-2 p-2 rounded-full bg-black/50 text-white disabled:opacity-20 z-10"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Info */}
        <div className="px-4 py-3 text-center text-xs text-white/50">
          {selectedIndex + 1} / {images.length}
        </div>
      </div>
    );
  }

  // ===== GRID VIEW =====
  const grouped = groupByDate(images);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <h1 className="text-sm font-semibold flex items-center gap-2">
          <ImageIcon size={18} /> Gallery
        </h1>
        <span className="text-xs text-[var(--muted-foreground)]">
          {images.length} images
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
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--muted-foreground)]">
          <ImageIcon size={48} className="opacity-30 mb-4" />
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">No Images</h2>
          <p className="text-sm text-center max-w-xs">
            No images found in {galleryPath}.
            <br />
            On your phone, photos will appear here automatically.
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
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
                {imgs.map((img) => {
                  const globalIdx = images.indexOf(img);
                  return (
                    <button
                      key={img.path}
                      onClick={() => setSelectedIndex(globalIdx)}
                      className="aspect-square rounded-lg overflow-hidden bg-[var(--muted)] hover:opacity-80 transition-opacity"
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
