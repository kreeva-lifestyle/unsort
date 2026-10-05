// The Catalog maker's photo list: add (thumbnails three at a time, cards
// fill in as they are read), SKU edit, reorder, sort, remove, duplicate
// detection, and object-URL cleanup. Split out of CatalogMaker so the
// component is layout + generate only. SKUs pre-fill from the file names
// ("100001.jpg" → 100001).
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { makeThumb, mapLimit } from './indexPhotos';
import { INDEX_MAX_TILES } from './renderIndex';
import type { DraftTile } from './CatalogTile';

const skuFromName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_\s]+/g, ' ').trim().toUpperCase();
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function useCatalogPhotos(addToast: (m: string, t?: string) => void, onChange: () => void) {
  const [tiles, setTiles] = useState<DraftTile[]>([]);
  const thumbs = useRef(new Map<string, string>());
  const count = useRef(0); // live tile count, for the cap inside addFiles
  useEffect(() => () => { thumbs.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) { addToast('Pick image files', 'error'); return; }
    // Build the new tiles HERE, not inside the state updater: React runs
    // updaters later (during the next render), so a list filled in there was
    // still empty when the thumbnail job below started — every card sat on
    // "Reading…" forever. `count` tracks the live length for the cap.
    const room = INDEX_MAX_TILES - count.current;
    if (room <= 0) { addToast(`A catalog holds up to ${INDEX_MAX_TILES} photos`, 'error'); return; }
    if (files.length > room) addToast(`Only the first ${room} photos were added — a catalog holds up to ${INDEX_MAX_TILES}`, 'info');
    const added: DraftTile[] = files.slice(0, room).map(f => ({ id: newId(), file: f, sku: skuFromName(f.name), thumb: null, w: 0, h: 0 }));
    count.current += added.length;
    setTiles(prev => [...prev, ...added]);
    onChange();
    mapLimit(added, 3, async t => {
      try {
        const m = await makeThumb(t.file);
        thumbs.current.set(t.id, m.thumb);
        setTiles(prev => prev.some(x => x.id === t.id) ? prev.map(x => (x.id === t.id ? { ...x, ...m } : x)) : (URL.revokeObjectURL(m.thumb), prev));
      } catch { addToast(`Could not read ${t.file.name} — try a JPG or PNG`, 'error'); count.current -= 1; setTiles(prev => prev.filter(x => x.id !== t.id)); }
    });
  };
  const onSku = useCallback((id: string, sku: string) => { setTiles(prev => prev.map(t => (t.id === id ? { ...t, sku } : t))); onChange(); }, [onChange]);
  const onMove = useCallback((i: number, dir: -1 | 1) => {
    setTiles(prev => { const j = i + dir; if (j < 0 || j >= prev.length) return prev; const n = prev.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
    onChange();
  }, [onChange]);
  const onRemove = useCallback((id: string) => {
    const u = thumbs.current.get(id); if (u) { URL.revokeObjectURL(u); thumbs.current.delete(id); }
    count.current = Math.max(0, count.current - 1);
    setTiles(prev => prev.filter(x => x.id !== id)); onChange();
  }, [onChange]);
  const sortBySku = () => { setTiles(prev => prev.slice().sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))); onChange(); };

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    tiles.forEach(t => { const k = t.sku.trim().toUpperCase(); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [tiles]);
  const missing = tiles.filter(t => !t.sku.trim()).length;
  const reading = tiles.filter(t => !t.thumb).length;

  return { tiles, addFiles, onSku, onMove, onRemove, sortBySku, dupes, missing, reading };
}
