// Index maker (RateCard Studio): drop in the design photos, give each its
// SKU, and get a catalog index image — a photo grid captioned with SKUs, the
// brand logo beside or above it (owner's sample: 4×2 grid, logo on the
// right, olive background). Nothing is uploaded; the image is drawn on a
// canvas by renderIndex.ts and shared through the same panel as the rate
// card. SKUs pre-fill from the file names ("100001.jpg" → 100001).
import { useState, useEffect, useMemo, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { renderIndex, indexGeometry, INDEX_THEMES, INDEX_MAX_TILES } from './renderIndex';
import type { IndexTheme, IndexLayout, IndexSource } from './renderIndex';
import IndexTile from './IndexTile';
import type { DraftTile } from './IndexTile';
import RateCardActions from './RateCardActions';
import { useScriptFont } from './useScriptFont';

const skuFromName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_\s]+/g, ' ').trim().toUpperCase();
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Could not load image')); img.src = src;
});
// Phone photos are 3–8 MB; a 1400 px long edge is plenty for a 400 px tile
// and keeps forty of them in memory at once.
const decodeTile = async (file: File): Promise<IndexSource> => {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  if (scale === 1) return bmp;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
};

export default function IndexMaker({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [tiles, setTiles] = useState<DraftTile[]>([]);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState<IndexTheme>('olive');
  const [layout, setLayout] = useState<IndexLayout>('landscape');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scriptFont = useScriptFont();

  useEffect(() => () => { tiles.forEach(t => URL.revokeObjectURL(t.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) { addToast('Pick image files', 'error'); return; }
    setTiles(prev => {
      const room = INDEX_MAX_TILES - prev.length;
      if (room <= 0) { addToast(`An index holds up to ${INDEX_MAX_TILES} photos`, 'error'); return prev; }
      if (files.length > room) addToast(`Only the first ${room} photos were added — an index holds up to ${INDEX_MAX_TILES}`, 'info');
      const next = files.slice(0, room).map(f => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file: f, url: URL.createObjectURL(f), sku: skuFromName(f.name) }));
      return [...prev, ...next];
    });
    setResult(null);
  };
  const patch = (id: string, sku: string) => { setTiles(prev => prev.map(t => (t.id === id ? { ...t, sku } : t))); setResult(null); };
  const move = (i: number, dir: -1 | 1) => {
    setTiles(prev => { const j = i + dir; if (j < 0 || j >= prev.length) return prev; const n = prev.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
    setResult(null);
  };
  const remove = (id: string) => { setTiles(prev => { const t = prev.find(x => x.id === id); if (t) URL.revokeObjectURL(t.url); return prev.filter(x => x.id !== id); }); setResult(null); };
  const sortBySku = () => { setTiles(prev => prev.slice().sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))); setResult(null); };

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    tiles.forEach(t => { const k = t.sku.trim().toUpperCase(); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [tiles]);
  const missing = tiles.filter(t => !t.sku.trim()).length;
  const ready = tiles.length > 0 && missing === 0 && !busy;
  const geo = indexGeometry(Math.max(1, tiles.length), layout, !!title.trim());

  const generate = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const logoImg = await loadImg('/arya-designs-logo.png').catch(() => null);
      if (!logoImg) addToast('Logo image failed to load — index generated without it', 'info');
      const imgs = await Promise.all(tiles.map(t => decodeTile(t.file)));
      const canvas = document.createElement('canvas');
      renderIndex(canvas, { tiles: tiles.map((t, i) => ({ img: imgs[i], sku: t.sku })), title, theme, layout, logoImg, scriptFont });
      imgs.forEach(im => { if ('close' in im) im.close(); });
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Could not create the image')), 'image/jpeg', 0.92));
      setResult(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(blob), blob }; });
      addToast('Index ready', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy(false);
  };

  const seg = <V extends string>(value: V, opts: [V, string][], onPick: (v: V) => void) => (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 3 }}>
      {opts.map(([v, label]) => (
        <button key={v} type="button" onClick={() => { onPick(v); setResult(null); }} aria-pressed={value === v}
          style={{ ...S.btnSm, minHeight: 30, border: 'none', cursor: 'pointer', borderRadius: 6, background: value === v ? T.ac3 : 'transparent', color: value === v ? T.ac2 : T.tx3, fontWeight: value === v ? 700 : 500 }}>{label}</button>
      ))}
    </div>
  );

  return (
    <div style={{ animation: 'fi .15s ease', maxWidth: 720 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
        <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          style={{ padding: '18px 14px', borderRadius: 8, border: `1px dashed ${tiles.length ? 'oklch(0.72 0.19 145 / .35)' : T.bd2}`, background: tiles.length ? 'oklch(0.72 0.19 145 / .05)' : T.glass1, cursor: 'pointer', textAlign: 'center', minHeight: 44, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tiles.length ? T.gr : T.tx2 }}>{tiles.length ? `${tiles.length} photo${tiles.length === 1 ? '' : 's'} — tap to add more` : 'Add design photos'}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>Pick several at once · SKU fills from the file name · up to {INDEX_MAX_TILES}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={S.fLabel}>Catalog name (optional)</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setResult(null); }} placeholder="e.g. Tehzeeb" style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div><label style={S.fLabel}>Layout</label>{seg(layout, [['landscape', 'Landscape'], ['portrait', 'Portrait']], setLayout)}</div>
          <div><label style={S.fLabel}>Background</label>{seg(theme, (Object.keys(INDEX_THEMES) as IndexTheme[]).map(k => [k, INDEX_THEMES[k].label]), setTheme)}</div>
        </div>

        {tiles.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{geo.cols} × {geo.rows} grid · {geo.W}×{geo.H} px</span>
              <button type="button" onClick={sortBySku} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Sort by SKU</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 8, marginBottom: 12 }}>
              {tiles.map((t, i) => (
                <IndexTile key={t.id} tile={t} index={i} count={tiles.length} duplicate={dupes.has(t.sku.trim().toUpperCase())}
                  onSku={v => patch(t.id, v)} onMove={d => move(i, d)} onRemove={() => remove(t.id)} />
              ))}
            </div>
          </>
        )}

        <button onClick={generate} disabled={!ready} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', pointerEvents: busy ? 'none' : 'auto', opacity: ready ? 1 : 0.5 }}>
          {busy ? 'Generating…' : 'Generate Index'}
        </button>
        {!ready && !busy && (
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
            To enable: {[tiles.length === 0 && 'add at least one photo', missing > 0 && `type the SKU on ${missing} photo${missing === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
          </div>
        )}
        {ready && dupes.size > 0 && <div style={{ fontSize: 10, color: T.yl, marginTop: 6, textAlign: 'center' }}>Repeated SKU{dupes.size === 1 ? '' : 's'}: {[...dupes].join(', ')} — the index will still generate</div>}
      </div>

      {result && <RateCardActions result={result} catalogName={title || 'Index'} fileLabel="Index" addToast={addToast} />}
      {!result && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Add the design photos, check each SKU, then Generate to get a WhatsApp-ready index image.</div>}
    </div>
  );
}
