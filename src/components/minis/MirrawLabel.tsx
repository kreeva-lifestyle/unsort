// LabelMaker → "Mirraw label": pick the courier slip Mirraw gives for an
// order (a 6 × 2.7 in landscape PDF — barcode, AWB, TO, FROM, the return
// line) and print it on the 4 × 6 in sticker roll with nothing lost. The
// page is drawn at 300 dpi exactly as it is and turned on its side, so the
// slip's 6 in runs along the sticker's 6 in at full size, barcode included.
// A portrait PDF stays upright and is fitted to the width. One sticker per
// page; several PDFs at once make several stickers in one print.
import { useRef, useState } from 'react';
import { S, Icon } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { printOrQueue } from '../../lib/printQueue';
import { docTitle, fileDate } from '../../lib/exportName';
import { escHtml } from '../../lib/escape';
import { renderPdfPages, type PdfPageImage } from '../../lib/pdfPages';
import PrintPreview from '../ui/PrintPreview';

const W = 4, H = 6, PAD = 0.08; // inches: the sticker, and the breathing room around the slip

/** The AWB Mirraw prints on the slip ("M217242917"), from the page text or the file name. */
export const awbOf = (text: string, fileName: string): string => (text.match(/\bM\d{8,10}\b/) || fileName.match(/M\d{8,10}/) || [''])[0];

/** One sticker per page. A landscape page is turned on its side to use the sticker's full height; the slip is scaled to fill, keeping its proportions. */
export function mirrawLabelHtml(pages: PdfPageImage[], title: string): string {
  const cards = pages.map(p => {
    const turn = p.widthIn > p.heightIn;
    const boxW = (turn ? H : W) - 2 * PAD, boxH = (turn ? W : H) - 2 * PAD; // along the slip's own axes
    const scale = Math.min(boxW / p.widthIn, boxH / p.heightIn);
    const w = (p.widthIn * scale).toFixed(3), h = (p.heightIn * scale).toFixed(3);
    return `<div class="label"><img src="${p.dataUrl}" alt="" style="width:${w}in;height:${h}in;transform:translate(-50%,-50%)${turn ? ' rotate(-90deg)' : ''}"></div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff}.label{width:${W}in;height:${H}in;position:relative;overflow:hidden;page-break-after:always;border:1px solid #ccc}.label img{position:absolute;left:50%;top:50%}@media print{.label{border:none}.label:last-child{page-break-after:auto}}@page{size:${W}in ${H}in;margin:0}</style></head><body>${cards}</body></html>`;
}

export default function MirrawLabel({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState('');
  const [sending, setSending] = useState('');
  const [preview, setPreview] = useState<{ html: string; title: string; n: number } | null>(null);

  const load = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (!pdfs.length) { addToast('Pick the Mirraw label PDF', 'error'); return; }
    setBusy('Reading…');
    try {
      const pages: PdfPageImage[] = [], awbs: string[] = [];
      for (const f of pdfs) {
        const ps = await renderPdfPages(f);
        pages.push(...ps);
        for (const p of ps) { const a = awbOf(p.text, f.name); if (a && !awbs.includes(a)) awbs.push(a); }
      }
      if (!pages.length) throw new Error('That PDF has no pages');
      const title = `Mirraw label${awbs.length ? ' · ' + awbs.join(', ') : ''}${pages.length > 1 ? ` · ${pages.length} stickers` : ''}`;
      setPreview({ html: mirrawLabelHtml(pages, docTitle(`Mirraw-Label${awbs[0] ? '-' + awbs[0] : ''}`, fileDate())), title, n: pages.length });
    } catch (e) { addToast(friendlyError(e, 'Could not read that PDF'), 'error'); }
    setBusy('');
    if (input.current) input.current.value = '';
  };

  const print = async (frame: HTMLIFrameElement | null) => {
    if (!preview || sending) return;
    setSending('Printing…');
    await printOrQueue('label_large', preview.html, { width: W, height: H }, preview.title, undefined, addToast, frame);
    setSending('');
  };

  return (
    <>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { if (e.target.files?.length) load(e.target.files); }} />
      <button type="button" onClick={() => input.current?.click()} title="Print a Mirraw courier label PDF on a 4 × 6 in sticker — drop the file here or tap to pick it"
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) load(e.dataTransfer.files); }}
        style={{ ...S.btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.6 : 1 }}>
        <Icon name="file" size={13} />{busy || 'Mirraw label'}
      </button>
      {preview && <PrintPreview title={preview.title} html={preview.html} onClose={() => setPreview(null)} onPrint={print} busy={sending} printLabel={preview.n > 1 ? `Print ${preview.n} stickers` : 'Print'} />}
    </>
  );
}
