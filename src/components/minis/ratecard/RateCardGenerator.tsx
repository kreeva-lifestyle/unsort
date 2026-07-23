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
        skuCol: parsed.skuCol, priceCol: parsed.priceCol,
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

  // Send to WhatsApp. There is no way to attach an image to a specific number
  // from the web, so on a phone we share the image file (WhatsApp shows up in
  // the share sheet); on desktop we save the image and open WhatsApp Web so the
  // user can drop it into a chat.
  const whatsapp = async () => {
    if (!result) return;
    const file = new File([result.blob], fileName(), { type: 'image/jpeg' });
    const text = `${catalogName.trim() || 'Rate card'} — rate card`;
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: catalogName.trim(), text }); }
      catch (e: any) { if (e?.name !== 'AbortError') addToast(friendlyError(e), 'error'); }
      return;
    }
    download();
    addToast('Image saved — attach it in the WhatsApp chat', 'success');
    window.open('https://web.whatsapp.com', '_blank', 'noopener');
  };

  const pickBox = (label: string, value: string, onClick: () => void) => (
    <div onClick={onClick} style={{ padding: '14px 14px', borderRadius: 8, border: `1px dashed ${value ? 'oklch(0.72 0.19 145 / .35)' : T.bd2}`, background: value ? 'oklch(0.72 0.19 145 / .05)' : T.glass1, cursor: 'pointer', minHeight: 44 }}>
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
        {/* smart checks — GST slab autocorrect, duplicate SKUs, price/rounding notes */}
        {parsed && (parsed.warnings.length > 0 ? (
          <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.yl, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Smart checks — {parsed.warnings.length} note{parsed.warnings.length === 1 ? '' : 's'}</div>
            {parsed.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: T.tx2, lineHeight: 1.6 }}>• {w}</div>)}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: T.gr, marginBottom: 10 }}>✓ Smart checks passed — GST slabs, SKUs and totals all look right</div>
        ))}
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
            <button onClick={whatsapp} style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center', background: T.gr, border: 'none', color: '#fff' }}>WhatsApp</button>
            <button onClick={share} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Share</button>
            <button onClick={download} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Save</button>
          </div>
        </div>
      )}
      {!result && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Fill the catalog name, pick the photo and import the rate Excel — then Generate to get a WhatsApp-ready image.</div>}
    </div>
  );
}
