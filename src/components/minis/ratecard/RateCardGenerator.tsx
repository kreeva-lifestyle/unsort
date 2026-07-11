// RateCard Studio — catalog name + hero photo + Excel → glassmorphic
// rate-card JPG (WhatsApp-ready). Fully client-side: nothing is uploaded
// or saved; the image is drawn on a canvas by renderRateCard.ts.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { parseRateSheet, ParsedRateSheet } from './parseRateSheet';
import { renderRateCard } from './renderRateCard';

const SCRIPT_FONT_URL = 'https://fonts.gstatic.com/s/greatvibes/v21/RWmMoKWR9v4ksMfaWd_JN9XFiaQoDmlr.woff2';
const DEFAULT_DISCLAIMER = 'ALL RATES ARE FLAT NO DISCOUNT AND EXCLUSIVE OF GST AND SHIPPING';

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error('Could not load image'));
  img.src = src;
});

export default function RateCardGenerator({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [catalogName, setCatalogName] = useState('');
  const [disclaimer, setDisclaimer] = useState(DEFAULT_DISCLAIMER);
  const [heroUrl, setHeroUrl] = useState('');
  const [heroName, setHeroName] = useState('');
  const [parsed, setParsed] = useState<ParsedRateSheet | null>(null);
  const [excelName, setExcelName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const heroRef = useRef<HTMLInputElement>(null);
  const xlsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fancy script font for the catalog name — canvas needs it registered on
    // document.fonts. Falls back to Sora if the fetch fails; never blocks.
    // (No fonts.check() guard: it returns true for families the page never
    // registered, so it would skip the load and we'd render the fallback.)
    const face = new FontFace('Great Vibes', `url(${SCRIPT_FONT_URL})`);
    face.load().then(f => { document.fonts.add(f); setScriptReady(true); }).catch(() => {});
  }, []);
  useEffect(() => () => { if (heroUrl) URL.revokeObjectURL(heroUrl); }, [heroUrl]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const pickHero = (f: File) => {
    if (!f.type.startsWith('image/')) { addToast('Please select an image file', 'error'); return; }
    if (f.size > 10 * 1024 * 1024) { addToast('Image must be under 10MB', 'error'); return; }
    setHeroUrl(URL.createObjectURL(f)); setHeroName(f.name); setResult(null);
  };

  const pickExcel = (f: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const p = parseRateSheet(ev.target?.result as ArrayBuffer);
        setParsed(p); setExcelName(f.name); setResult(null);
        p.warnings.forEach(w => addToast(w, 'info'));
        addToast(`${p.rows.length} design${p.rows.length === 1 ? '' : 's'} imported (${p.columns.join(', ')})`, 'success');
      } catch (e) { addToast(friendlyError(e), 'error'); }
    };
    reader.readAsArrayBuffer(f);
  };

  const ready = catalogName.trim() && heroUrl && parsed && parsed.rows.length > 0;

  const generate = async () => {
    if (busy || !ready || !parsed) return;
    setBusy(true);
    try {
      const heroImg = await loadImg(heroUrl);
      const logoImg = await loadImg('/arya-designs-logo.png').catch(() => null);
      if (!logoImg) addToast('Logo image failed to load — card generated without it', 'info');
      const canvas = document.createElement('canvas');
      await renderRateCard(canvas, {
        heroImg, logoImg, catalogName: catalogName.trim(), rows: parsed.rows, columns: parsed.columns,
        disclaimer, stats: parsed.stats, scriptFont: scriptReady ? 'Great Vibes' : 'Sora',
      });
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Could not create the image')), 'image/jpeg', 0.92));
      setResult(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(blob), blob }; });
      addToast('Rate card ready', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy(false);
  };

  const fileName = () => `RateCard-${catalogName.trim().replace(/[^\w-]+/g, '_') || 'catalog'}.jpg`;

  const share = async () => {
    if (!result) return;
    const file = new File([result.blob], fileName(), { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: catalogName.trim() });
      else download();
    } catch (e: any) { if (e?.name !== 'AbortError') addToast(friendlyError(e), 'error'); }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = fileName(); a.click();
  };

  const pickBox = (label: string, value: string, onClick: () => void) => (
    <div onClick={onClick} style={{ padding: '14px 14px', borderRadius: 8, border: `1px dashed ${value ? 'rgba(34,197,94,.35)' : T.bd2}`, background: value ? 'rgba(34,197,94,.05)' : T.glass1, cursor: 'pointer', minHeight: 44 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: value ? T.gr : T.tx2 }}>{label}</div>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'Tap to choose'}</div>
    </div>
  );

  return (
    <div style={{ animation: 'fi .15s ease', maxWidth: 560 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ marginBottom: 10 }}>
          <label style={S.fLabel}>Catalog Name</label>
          <input value={catalogName} onChange={e => { setCatalogName(e.target.value); setResult(null); }} placeholder="e.g. Tehzeeb" style={{ ...S.fInput, width: '100%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {pickBox('Catalog Photo', heroName, () => heroRef.current?.click())}
          {pickBox('Rate Excel', excelName ? `${excelName} · ${parsed?.rows.length ?? 0} designs` : '', () => xlsRef.current?.click())}
        </div>
        <input ref={heroRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickHero(f); e.target.value = ''; }} />
        <input ref={xlsRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickExcel(f); e.target.value = ''; }} />
        {heroUrl && <img src={heroUrl} alt="Catalog" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.bd}`, marginBottom: 10 }} />}
        {parsed && parsed.stats && (
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10, fontFamily: T.mono }}>
            {parsed.stats.designs} designs{parsed.stats.total > 0 ? ` · avg RS.${parsed.stats.avg.toLocaleString('en-IN')} · total RS.${parsed.stats.total.toLocaleString('en-IN')}` : ''}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={S.fLabel}>Bottom Note</label>
          <input value={disclaimer} onChange={e => { setDisclaimer(e.target.value); setResult(null); }} style={{ ...S.fInput, width: '100%' }} />
        </div>
        <button onClick={generate} disabled={busy || !ready} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', pointerEvents: busy ? 'none' : 'auto', opacity: busy || !ready ? 0.5 : 1 }}>
          {busy ? 'Generating…' : 'Generate Rate Card'}
        </button>
      </div>

      {result && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12 }}>
          <img src={result.url} alt="Rate card preview" style={{ width: '100%', borderRadius: 8, display: 'block', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={share} style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center' }}>Share</button>
            <button onClick={download} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Download JPG</button>
          </div>
        </div>
      )}
      {!result && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Fill the catalog name, pick the photo and import the rate Excel — then Generate to get a WhatsApp-ready image.</div>}
    </div>
  );
}
