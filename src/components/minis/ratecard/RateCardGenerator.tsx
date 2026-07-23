// RateCard Studio — catalog name + hero photo + rate rows → glassmorphic
// rate-card JPG (WhatsApp-ready). Rows come from an Excel import OR the
// in-app manual editor (same finalize pass either way). Fully client-side:
// nothing is uploaded or saved (the manual draft lives in localStorage);
// the image is drawn on a canvas by renderRateCard.ts.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { parseRateSheet, ParsedRateSheet } from './parseRateSheet';
import { renderRateCard } from './renderRateCard';
import ManualRateEditor from './ManualRateEditor';
import MasterRateCard from './MasterRateCard';
import RateCardActions from './RateCardActions';

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
  const [mode, setMode] = useState<'import' | 'manual' | 'master'>('import');
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
        addToast(`${p.rows.length} design${p.rows.length === 1 ? '' : 's'} imported (${p.columns.join(', ')})`, 'success');
      } catch (e) { addToast(friendlyError(e), 'error'); }
    };
    reader.readAsArrayBuffer(f);
  };

  const setMode2 = (m: 'import' | 'manual' | 'master') => {
    if (m === mode) return;
    // Rows don't carry across modes; the manual draft survives in localStorage
    // and re-feeds parsed when its editor remounts.
    setMode(m); setParsed(null); setExcelName(''); setResult(null);
  };

  const blocked = (parsed?.blockers.length ?? 0) > 0;
  const ready = catalogName.trim() && heroUrl && parsed && parsed.rows.length > 0 && !blocked;

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
        skuCol: parsed.skuCol, priceCol: parsed.priceCol,
        disclaimer, stats: parsed.stats, scriptFont: scriptReady ? 'Great Vibes' : 'Sora',
      });
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Could not create the image')), 'image/jpeg', 0.92));
      setResult(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(blob), blob }; });
      addToast('Rate card ready', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy(false);
  };

  const pickBox = (label: string, value: string, onClick: () => void) => (
    <div onClick={onClick} style={{ padding: '14px 14px', borderRadius: 8, border: `1px dashed ${value ? 'oklch(0.72 0.19 145 / .35)' : T.bd2}`, background: value ? 'oklch(0.72 0.19 145 / .05)' : T.glass1, cursor: 'pointer', minHeight: 44 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: value ? T.gr : T.tx2 }}>{label}</div>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'Tap to choose'}</div>
    </div>
  );

  const modeBtn = (m: 'import' | 'manual' | 'master', label: string) => (
    <button onClick={() => setMode2(m)} style={mode === m ? { ...S.btnPrimary, ...S.btnSm, minHeight: 32 } : { ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>{label}</button>
  );

  return (
    <div style={{ animation: 'fi .15s ease', maxWidth: 560 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ marginBottom: 10 }}>
          <label style={S.fLabel}>Catalog Name</label>
          <input value={catalogName} onChange={e => { setCatalogName(e.target.value); setResult(null); }} placeholder="e.g. Tehzeeb" style={{ ...S.fInput, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {modeBtn('import', 'Import Excel')}
          {modeBtn('manual', 'Build manually')}
          {modeBtn('master', 'From Master')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'import' ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 10 }}>
          {pickBox('Catalog Photo', heroName, () => heroRef.current?.click())}
          {mode === 'import' && pickBox('Rate Excel', excelName ? `${excelName} · ${parsed?.rows.length ?? 0} designs` : '', () => xlsRef.current?.click())}
        </div>
        <input ref={heroRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickHero(f); e.target.value = ''; }} />
        <input ref={xlsRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickExcel(f); e.target.value = ''; }} />
        {mode === 'manual' && <ManualRateEditor onSheet={s => { setParsed(s); setResult(null); }} addToast={addToast} />}
        {mode === 'master' && <MasterRateCard onSheet={s => { setParsed(s); setResult(null); }} addToast={addToast} />}
        {heroUrl && <img src={heroUrl} alt="Catalog" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.bd}`, marginBottom: 10 }} />}
        {parsed && parsed.stats && (
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10, fontFamily: T.mono }}>
            {parsed.stats.designs} designs{parsed.stats.total > 0 ? ` · avg RS.${parsed.stats.avg.toLocaleString('en-IN')} · total RS.${parsed.stats.total.toLocaleString('en-IN')}` : ''}
          </div>
        )}
        {/* blockers — the all-or-nothing price rule; Generate stays disabled */}
        {parsed && blocked && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10, lineHeight: 1.6 }}>
            {parsed.blockers.map((b, i) => <div key={i}>• {b}</div>)}
          </div>
        )}
        {/* smart checks — GST slab autocorrect, duplicate SKUs, price/rounding notes */}
        {parsed && !blocked && (parsed.warnings.length > 0 ? (
          <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.yl, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Smart checks — {parsed.warnings.length} note{parsed.warnings.length === 1 ? '' : 's'}</div>
            {parsed.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: T.tx2, lineHeight: 1.6 }}>• {w}</div>)}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: T.gr, marginBottom: 10 }}>✓ Smart checks passed — {parsed.priceCol ? 'GST slabs, SKUs and totals all look right' : 'SKUs look right (price-less card)'}</div>
        ))}
        <div style={{ marginBottom: 12 }}>
          <label style={S.fLabel}>Bottom Note</label>
          <input value={disclaimer} onChange={e => { setDisclaimer(e.target.value); setResult(null); }} style={{ ...S.fInput, width: '100%' }} />
        </div>
        <button onClick={generate} disabled={busy || !ready} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', pointerEvents: busy ? 'none' : 'auto', opacity: busy || !ready ? 0.5 : 1 }}>
          {busy ? 'Generating…' : 'Generate Rate Card'}
        </button>
      </div>

      {result && <RateCardActions result={result} catalogName={catalogName} addToast={addToast} />}
      {!result && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Fill the catalog name, pick the photo and {mode === 'import' ? 'import the rate Excel' : mode === 'manual' ? 'type the rows' : 'fetch the SKUs from the master sheet'} — then Generate to get a WhatsApp-ready image.</div>}
    </div>
  );
}
