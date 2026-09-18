// Catalog maker (RateCard Studio): drop in the design photos, give each its
// SKU, pick an output —
//   Index: one image, a photo grid captioned with SKUs, the brand logo
//          beside or above it, on a backdrop blended from the photos.
//   Pages: two SKUs per page, each photo whole with its code right-aligned
//          beneath, on a clean white sheet (owner's sample).
// Nothing is uploaded; the images are drawn on canvases (renderIndex.ts,
// renderPages.ts) and shared through the rate card's panel. Photos go
// through indexPhotos.ts (thumbnails for the editor, tile-size decodes at
// Generate); the photo list lives in useCatalogPhotos.
import { useState, useEffect, useRef, useCallback } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { renderIndex, indexGeometry, INDEX_MOODS, INDEX_MAX_TILES } from './renderIndex';
import type { IndexMood, IndexLayout, IndexSource } from './renderIndex';
import { renderPage, pageCount, PER_PAGE, PAGE_H } from './renderPages';
import { decodeForRender, mapLimit } from './indexPhotos';
import { useCatalogPhotos } from './useCatalogPhotos';
import CatalogTile from './CatalogTile';
import CatalogResults from './CatalogResults';
import type { PageResult } from './CatalogResults';
import { useScriptFont, useDisplayFont } from './useScriptFont';

type Output = 'index' | 'pages';
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Could not load image')); img.src = src;
});
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not create the image')), 'image/jpeg', 0.92));

export default function CatalogMaker({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [output, setOutput] = useState<Output>('index');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<IndexMood>('dark');
  const [layout, setLayout] = useState<IndexLayout>('landscape');
  const [busy, setBusy] = useState('');
  const [pages, setPages] = useState<PageResult[]>([]);
  const clear = useCallback(() => setPages(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return prev.length ? [] : prev; }), []);
  const photos = useCatalogPhotos(addToast, clear);
  const { tiles } = photos;
  const fileRef = useRef<HTMLInputElement>(null);
  const scriptFont = useScriptFont();
  const displayFont = useDisplayFont();
  useEffect(() => () => { pages.forEach(p => URL.revokeObjectURL(p.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = tiles.length > 0 && photos.missing === 0 && photos.reading === 0 && !busy;
  const geo = indexGeometry(Math.max(1, tiles.length), layout, !!title.trim());
  const sizeLine = output === 'index'
    ? `${geo.cols} × ${geo.rows} grid · ${geo.W}×${geo.H} px`
    : `${pageCount(tiles.length)} page${pageCount(tiles.length) === 1 ? '' : 's'} · ${PER_PAGE} per page · ${PAGE_H} px tall`;

  const generate = async () => {
    if (!ready) return;
    setBusy('Preparing photos…');
    const release = (imgs: IndexSource[]) => imgs.forEach(im => { if ('close' in im) im.close(); });
    try {
      const out: PageResult[] = [];
      if (output === 'index') {
        // Index tiles are 400×600: a 900 px decode of every photo is enough and fits forty in memory.
        const imgs = await mapLimit(tiles, 4, t => decodeForRender(t.file, t.w, t.h), done => setBusy(`Preparing photo ${done} of ${tiles.length}…`));
        setBusy('Drawing…');
        await new Promise(r => setTimeout(r, 0)); // let the label paint before the synchronous draw
        const logoImg = await loadImg('/arya-designs-logo.png').catch(() => null);
        if (!logoImg) addToast('Logo image failed to load — index generated without it', 'info');
        const canvas = document.createElement('canvas');
        renderIndex(canvas, { tiles: tiles.map((t, i) => ({ img: imgs[i], sku: t.sku })), title, mood, layout, logoImg, scriptFont });
        release(imgs);
        out.push(await toBlob(canvas).then(blob => ({ url: URL.createObjectURL(blob), blob })));
      } else {
        // Pages are full-height photos: decode each page's two at 1600 px, draw, release, next.
        // An odd last page gets the brand panel (logo + catalog name) in its empty half.
        const logoImg = tiles.length % PER_PAGE ? await loadImg('/arya-designs-logo.png').catch(() => null) : null;
        for (let i = 0; i < tiles.length; i += PER_PAGE) {
          setBusy(`Page ${i / PER_PAGE + 1} of ${pageCount(tiles.length)}…`);
          const slice = tiles.slice(i, i + PER_PAGE);
          const imgs = await Promise.all(slice.map(t => decodeForRender(t.file, t.w, t.h, PAGE_H)));
          const canvas = document.createElement('canvas');
          renderPage(canvas, slice.map((t, j) => ({ img: imgs[j], sku: t.sku })), { title, logoImg, scriptFont, displayFont });
          release(imgs);
          out.push(await toBlob(canvas).then(blob => ({ url: URL.createObjectURL(blob), blob })));
        }
      }
      clear(); setPages(out);
      addToast(output === 'index' ? 'Index ready' : `${out.length} page${out.length === 1 ? '' : 's'} ready`, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy('');
  };

  const seg = <V extends string>(value: V, opts: [V, string][], onPick: (v: V) => void) => (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 3 }}>
      {opts.map(([v, label]) => (
        <button key={v} type="button" onClick={() => { onPick(v); clear(); }} aria-pressed={value === v}
          style={{ ...S.btnSm, minHeight: 30, border: 'none', cursor: 'pointer', borderRadius: 6, background: value === v ? T.ac3 : 'transparent', color: value === v ? T.ac2 : T.tx3, fontWeight: value === v ? 700 : 500 }}>{label}</button>
      ))}
    </div>
  );

  return (
    <div style={{ animation: 'fi .15s ease', maxWidth: 720 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) photos.addFiles(e.target.files); e.target.value = ''; }} />
        <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); photos.addFiles(e.dataTransfer.files); }}
          style={{ padding: '18px 14px', borderRadius: 8, border: `1px dashed ${tiles.length ? 'oklch(0.72 0.19 145 / .35)' : T.bd2}`, background: tiles.length ? 'oklch(0.72 0.19 145 / .05)' : T.glass1, cursor: 'pointer', textAlign: 'center', minHeight: 44, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tiles.length ? T.gr : T.tx2 }}>{tiles.length ? `${tiles.length} photo${tiles.length === 1 ? '' : 's'} — tap to add more` : 'Add design photos'}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>Pick several at once · SKU fills from the file name · up to {INDEX_MAX_TILES}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div><label style={S.fLabel}>Output</label>{seg(output, [['index', 'Index'], ['pages', 'Pages (2 per page)']], setOutput)}</div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={S.fLabel}>Catalog name (optional)</label>
            <input value={title} onChange={e => { setTitle(e.target.value); clear(); }} placeholder="e.g. Tehzeeb" style={{ ...S.fInput, width: '100%' }} />
          </div>
          {output === 'index' && <div><label style={S.fLabel}>Layout</label>{seg(layout, [['landscape', 'Landscape'], ['portrait', 'Portrait']], setLayout)}</div>}
          {output === 'index' && <div><label style={S.fLabel}>Mood</label>{seg(mood, (Object.keys(INDEX_MOODS) as IndexMood[]).map(k => [k, INDEX_MOODS[k].label]), setMood)}</div>}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: -6, marginBottom: 12 }}>
          {output === 'index' ? 'Index: one grid image with the logo; the backdrop is blended from the photos themselves.' : 'Pages: two photos per page edge to edge, each with its code inside. An odd last page shows the logo and catalog name in its other half.'}
        </div>

        {tiles.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{sizeLine}{photos.reading > 0 ? ` · reading ${photos.reading}…` : ''}</span>
              <button type="button" onClick={photos.sortBySku} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Sort by SKU</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 8, marginBottom: 12 }}>
              {tiles.map((t, i) => (
                <CatalogTile key={t.id} tile={t} index={i} count={tiles.length} duplicate={photos.dupes.has(t.sku.trim().toUpperCase())} onSku={photos.onSku} onMove={photos.onMove} onRemove={photos.onRemove} />
              ))}
            </div>
          </>
        )}

        <button onClick={generate} disabled={!ready} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', pointerEvents: busy ? 'none' : 'auto', opacity: ready ? 1 : 0.5 }}>
          {busy || (output === 'index' ? 'Generate Index' : 'Generate Pages')}
        </button>
        {!ready && !busy && (
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
            To enable: {[tiles.length === 0 && 'add at least one photo', photos.missing > 0 && `type the SKU on ${photos.missing} photo${photos.missing === 1 ? '' : 's'}`, photos.reading > 0 && 'wait for the photos to finish reading'].filter(Boolean).join(' · ')}
          </div>
        )}
        {ready && photos.dupes.size > 0 && <div style={{ fontSize: 10, color: T.yl, marginTop: 6, textAlign: 'center' }}>Repeated SKU{photos.dupes.size === 1 ? '' : 's'}: {[...photos.dupes].join(', ')} — it will still generate</div>}
      </div>

      {pages.length > 0 && <CatalogResults pages={pages} label={output === 'index' ? 'Index' : 'Catalog'} title={title} addToast={addToast} />}
      {pages.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Add the design photos, check each SKU, pick the output, then Generate to get WhatsApp-ready images.</div>}
    </div>
  );
}
