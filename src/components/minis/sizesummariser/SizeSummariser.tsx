// Minis → Size Summariser: a customer's stitching-measurement form (the
// Google Forms response PDF) → one A4 Hindi tailor sheet. The device reads
// the PDF (text, page pictures, illustrations), the size-summariser edge
// function has the model extract every measurement and choice and checks
// it, and the sheet renders here, fitted to one page, straight into the
// print preview. Past sheets reopen from the list below; a re-run on another
// model keeps both for comparison.
import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { printOrQueue } from '../../../lib/printQueue';
import PrintPreview from '../../ui/PrintPreview';
import { readForm } from './pdfForm';
import { loadSettings, uploadSource, downloadSource, storeDiagrams, labelDiagrams, extract, diagramUrl, listExtractions } from './api';
import { sheetHtml } from './sheetHtml';
import { fitToOnePage } from './fitSheet';
import ExtractionList from './ExtractionList';
import type { Extraction, ExtractionRow, SummariserSettings } from './types';

type Phase = { step: string; pct: number } | null;

export default function SizeSummariser({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [settings, setSettings] = useState<SummariserSettings | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [rows, setRows] = useState<ExtractionRow[] | null>(null);
  const [sheet, setSheet] = useState<{ html: string; title: string; fits: boolean; order: string } | null>(null);
  const [sending, setSending] = useState('');

  const reload = useCallback(() => { listExtractions().then(setRows).catch(e => { addToast(friendlyError(e), 'error'); setRows([]); }); }, [addToast]);
  useEffect(() => { loadSettings().then(setSettings).catch(e => addToast(friendlyError(e), 'error')); reload(); }, [addToast, reload]);

  /** Build and open the sheet for an extraction (fitted to one page). */
  const open = useCallback(async (ex: Extraction) => {
    const s = settings || await loadSettings();
    const { html, fits } = await fitToOnePage(fit => sheetHtml({ ex, diagramUrl: m => (m.diagram ? diagramUrl(m.diagram) : null), title: s.sheet_title || 'सिलाई नाप — सारांश', footer: s.footer_text, fit }));
    if (!fits) addToast('The sheet is still longer than one page — print and check', 'error');
    setSheet({ html, title: `${ex.order.order_no} · ${ex.order.product_name}`, fits, order: ex.order.order_no });
  }, [settings, addToast]);

  /** The whole run: read → store → extract → sheet. `parent` = a re-run of an earlier row on another model. */
  const run = async (file: File, parent?: { row: ExtractionRow; model: string }) => {
    if (phase) return;
    try {
      setPhase({ step: 'Reading the form…', pct: 0 });
      const form = await readForm(file, (d, t) => setPhase({ step: `Reading page ${d} of ${t}…`, pct: Math.round((d / t) * 60) }), { rasterOnlyOptionPages: !!settings?.raster_only_option_pages });
      setPhase({ step: 'Saving the form and its pictures…', pct: 65 });
      const source_path = parent?.row.source_path || await uploadSource(file);
      const diagrams = await storeDiagrams(form.diagrams, form.formType);
      setPhase({ step: `Reading ${form.pages.filter(p => p.isAnswer).length} pages with the model${form.textless ? ' (this PDF is pictures only — read twice)' : ''} — up to a minute…`, pct: 75 });
      const r = await extract({ pages: form.pages, file_name: file.name, form_type: form.formType, page_count: form.pageCount, source_path, diagrams, parent_id: parent?.row.id, model: parent?.model });
      if (!r.ok || !r.extraction) throw new Error(r.details || r.error || 'Extraction failed');
      const mismatches = await labelDiagrams(r.extraction);
      for (const m of mismatches) r.extraction.warnings.push({ severity: 'check', text_hi: m });
      setPhase({ step: 'Laying out the sheet…', pct: 92 });
      await open(r.extraction);
      const warn = r.extraction.warnings.filter(w => w.severity !== 'info').length;
      addToast(`${r.extraction.order.order_no}: ${r.extraction.measurements.length} measurements, ${r.extraction.choices.length} choices${warn ? `, ${warn} to check` : ''}${r.pii_detected ? ' · customer details left out' : ''}`, warn ? 'info' : 'success');
      reload();
    } catch (e) { addToast(friendlyError(e, 'Could not read that PDF'), 'error'); }
    setPhase(null);
    if (input.current) input.current.value = '';
  };

  const pick = (files: FileList | null) => {
    const f = files && files[0];
    if (!f) return;
    if (!(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) { addToast('Pick the form PDF', 'error'); return; }
    void run(f);
  };
  const rerun = async (row: ExtractionRow, model: string) => {
    if (!row.source_path) { addToast('The original PDF of this run was not kept — upload it again', 'error'); return; }
    try { setPhase({ step: 'Fetching the original PDF…', pct: 0 }); const f = await downloadSource(row.source_path); await run(f, { row, model }); }
    catch (e) { addToast(friendlyError(e), 'error'); setPhase(null); }
  };
  const print = async (frame: HTMLIFrameElement | null) => {
    if (!sheet || sending) return;
    setSending('Printing…');
    await printOrQueue('document', sheet.html, 'A4', `Tailor sheet ${sheet.order}`, undefined, addToast, frame);
    setSending('');
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>Size Summariser</div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Drop the customer's stitching form PDF (the Google Forms response) — one A4 Hindi tailor sheet comes out: every measurement with its picture, every design choice, warnings. No customer details.{settings ? ` · ${settings.model.replace('claude-', '').replace(/-/g, ' ')}` : ''}</div>
      </div>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => pick(e.target.files)} />
      <div onClick={() => !phase && input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!phase) pick(e.dataTransfer.files); }}
        role="button" style={{ border: `1.5px dashed ${phase ? T.ac33 : T.bd2}`, borderRadius: 10, padding: '22px 16px', textAlign: 'center', cursor: phase ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)', marginBottom: 14 }}>
        {phase ? (
          <div>
            <div style={{ fontSize: 12, color: T.tx2 }}>{phase.step}</div>
            <div style={{ height: 4, borderRadius: 2, background: T.s3, marginTop: 10, overflow: 'hidden' }}><div style={{ width: `${phase.pct}%`, height: '100%', background: T.ac, transition: 'width .3s' }} /></div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Tap to pick the form PDF</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>or drop it here · 20–30 pages · the model reads every page, about a minute</div>
          </div>
        )}
      </div>
      <ExtractionList rows={rows} onOpen={row => { void open(row.extraction); }} onRerun={rerun} busy={!!phase} />
      {sheet && <PrintPreview title={`${sheet.title}${sheet.fits ? '' : ' · ⚠ longer than one page'}`} html={sheet.html} onClose={() => setSheet(null)} onPrint={print} busy={sending} printLabel="Print A4" />}
    </div>
  );
}
