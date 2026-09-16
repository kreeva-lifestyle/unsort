// Builds the print HTML for Indya barcode labels on the 1.97 × 2.97 in
// label stock (the same page size as the QC label). Indya's own layout is
// a wide landscape cell; here the blocks stack top to bottom — product
// text, the barcode with its SKU, the details column, then the
// manufacturer footer — with every run at its original point size and
// weight. The bars are replayed as SVG rectangles from the PDF's own
// geometry (uniform horizontal scaling keeps every bar ratio), so the
// result scans exactly like the original. A tiny inline script shrinks a
// label's text a few percent at a time only if it would overflow.
import { escHtml } from '../../../lib/escape';
import { docTitle, fileDate } from '../../../lib/exportName';
import type { Bars, IndyaLabel, Line } from './indyaBarcodeParse';

const fmt = (n: number) => (Number.isFinite(n) ? +n.toFixed(3) : 0);

const barsSvg = (b: Bars) =>
  `<svg class="bc" viewBox="0 0 ${fmt(b.w)} ${fmt(b.h)}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${
    b.rects.map(([x, y, w, h]) => `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"/>`).join('')}</svg>`;

const lineHtml = (l: Line) =>
  `<div class="ln">${l.runs.map(r => `<span style="font-size:${fmt(Math.max(5, r.size))}em${r.bold ? ';font-weight:700' : ''}">${escHtml(r.text)}</span>`).join('')}</div>`;

const block = (lines: Line[], cls: string) => (lines.length ? `<div class="${cls}">${lines.map(lineHtml).join('')}</div>` : '');

const labelHtml = (l: IndyaLabel) =>
  `<div class="label"><div class="body">${block(l.left, 'blk')}${
    l.bars ? `<div class="bcwrap">${barsSvg(l.bars)}</div>` : ''}${
    l.sku ? `<div class="sku">${escHtml(l.sku)}</div>` : ''}${
    block(l.right, 'blk')}${block(l.footer, 'blk ft')}</div></div>`;

const CSS = `*{box-sizing:border-box}
body{margin:0;background:#fff;color:#000;font-family:Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.label{width:1.97in;height:2.97in;padding:.08in .09in;overflow:hidden;display:flex;flex-direction:column;page-break-after:always;break-after:page}
.body{font-size:1pt;flex:1;min-height:0;overflow:hidden;line-height:1.25;display:flex;flex-direction:column}
.body>*{flex-shrink:0}
.blk{margin-bottom:.045in}
.ln{display:flex;flex-wrap:wrap;column-gap:4pt;align-items:baseline}
.ln span{white-space:pre-wrap;overflow-wrap:anywhere}
.bcwrap{margin:.02in 0 .01in}
.bc{display:block;width:100%;height:.42in}
.bc rect{fill:#000}
.sku{font-weight:700;font-size:9em;text-align:center;letter-spacing:.06em;margin-bottom:.05in}
.ft{border-top:.5pt solid #000;padding-top:.03in;margin-top:auto}
@media print{@page{margin:0;size:1.97in 2.97in}.label{width:100%;height:100%}.label:last-child{page-break-after:auto;break-after:auto}}
@media screen{.label{border:1px solid #ccc;margin:8px auto}}`;

// Shrinks only the labels that overflow; sizes stay 1:1 with the PDF otherwise.
const FIT = `document.querySelectorAll('.body').forEach(function(b){var s=1;for(var i=0;i<14&&b.scrollHeight>b.clientHeight+1;i++){s*=0.94;b.style.fontSize=s+'pt';}});`;

/** The whole print document; `copies` repeats each label back to back. */
export function buildIndyaLabelsHtml(labels: IndyaLabel[], copies = 1): string {
  const n = Math.min(20, Math.max(1, Math.floor(copies) || 1));
  const body = labels.map(l => labelHtml(l).repeat(n)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(docTitle('Indya-Barcode-Labels', fileDate()))}</title><style>${CSS}</style></head><body>${body}<script>${FIT}</script></body></html>`;
}
