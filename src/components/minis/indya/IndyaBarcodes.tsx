// "Convert Indya barcode": picks one or more of Indya's barcode PDFs,
// reads every label off every page (any number per page) and previews
// them on the 1.97 × 2.97 in label stock, ready to print through the
// same path as the QC label (visible-frame print, or the cloud queue's
// label_small slot). Copies are expanded into the HTML itself so both
// print modes behave the same.
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { printOrQueue } from '../../../lib/printQueue';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import { readBytes } from './indyaFiles';
import { parseIndyaBarcodePdf, type IndyaLabel } from './indyaBarcodeParse';
import { buildIndyaLabelsHtml } from './indyaBarcodeLabel';

const BLUE = { color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)' };
const hidden = { position: 'absolute' as const, width: 0, height: 0, overflow: 'hidden' as const, opacity: 0 };
const short = (name: string) => (name.length > 28 ? `${name.slice(0, 25)}…` : name);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function IndyaBarcodes({ addToast, busy }: { addToast: (msg: string, type?: string) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null), frameRef = useRef<HTMLIFrameElement>(null);
  const [reading, setReading] = useState(false), [printing, setPrinting] = useState(false);
  const [labels, setLabels] = useState<IndyaLabel[] | null>(null);
  const [copies, setCopies] = useState('1');
  const open = !!labels;
  const close = () => { setLabels(null); setCopies('1'); };
  useModalLock(open);
  useBackClose(open, close);
  const n = Math.min(20, Math.max(1, parseInt(copies, 10) || 1));
  const html = useMemo(() => (labels ? buildIndyaLabelsHtml(labels, n) : ''), [labels, n]);

  // Cleared before the picker opens (same file twice), never in onChange — see IndyaToolbar.
  const pick = () => { if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); } };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setReading(true);
    const out: IndyaLabel[] = []; let failed = 0;
    for (const f of files) {
      try {
        const bytes = await readBytes(f);
        let got: IndyaLabel[];
        try { got = await parseIndyaBarcodePdf(bytes); }
        catch (err) { throw new Error(`${short(f.name)}: ${err instanceof Error && err.message === 'Not a PDF file' ? 'not a PDF' : 'could not read the labels'}`); }
        if (!got.length) throw new Error(`${short(f.name)}: no labels found`);
        out.push(...got);
      } catch (err) { failed++; addToast(friendlyError(err), 'error'); }
    }
    setReading(false);
    if (!out.length) return;
    const noBars = out.filter(l => !l.bars).length;
    if (noBars) addToast(`${plural(noBars, 'label')} without a vector barcode — printed as text only`, 'info');
    addToast(`${plural(out.length, 'label')} read from ${plural(files.length - failed, 'PDF')}`, 'success');
    setLabels(out);
  };

  const print = async () => {
    setPrinting(true);
    try { await printOrQueue('label_small', html, { width: 1.97, height: 2.97 }, 'Indya Barcodes', undefined, addToast, frameRef.current); }
    finally { setPrinting(false); }
  };

  const disabled = busy || reading;
  return (
    <>
      <button type="button" className="touch44" onClick={pick} style={{ ...S.btnGhost, ...BLUE, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>{reading ? 'Reading…' : 'Convert Indya barcode'}</button>
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple onChange={onFiles} style={hidden} aria-label="Indya barcode PDFs" />
      {labels && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.bd}`, background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Indya Barcode Labels</span>
              <div style={{ fontSize: 10, color: T.tx3 }}>{plural(labels.length, 'label')} · 1.97 × 2.97 in{n > 1 ? ` · ${n} copies each` : ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ ...S.fLabel, marginBottom: 0 }} htmlFor="indya-bc-copies">Copies</label>
              <input id="indya-bc-copies" type="number" min={1} max={20} inputMode="numeric" value={copies} onChange={e => setCopies(e.target.value)} onBlur={() => setCopies(String(n))} onKeyDown={e => numericKeyDown(e)} style={{ ...S.fInput, width: 64, textAlign: 'center' }} />
              <button onClick={close} style={{ width: 44, height: 44, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.glass2, color: T.tx2, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Close">&times;</button>
            </div>
          </div>
          <iframe ref={frameRef} title="Indya barcode label preview" srcDoc={html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={close} style={{ ...S.btnGhost, flex: 1, maxWidth: 200 }}>Close</button>
            <button onClick={print} style={{ ...S.btnPrimary, ...S.btnLg, flex: 1, maxWidth: 200, justifyContent: 'center', opacity: printing ? 0.5 : 1, pointerEvents: printing ? 'none' : 'auto' }}>{printing ? 'Printing…' : 'Print'}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
