// "Received on <date>" as a shareable image (white document, same drawing
// kit as the jobwork statements): per jobworker, each receipt with its SKU
// photo, JW #, job, what came back, where the job stands today, material
// returned, note and who entered it; subtotals and a day total. Amounts only
// when asked (the admin/manager switch on the preview).
import { Doc, head, C, PAD, W } from './jobworkImage';
import { fmtDate, mixedQty, qty, inr } from './jobworkModel';
import type { ReceivedRow, JobProgress } from './jobworkReceived';

const PH = 56;
const unitOf = (r: ReceivedRow) => (r.job?.qty_unit === 'm' ? 'm' : 'pcs');
const sum = (rows: ReceivedRow[], f: (r: ReceivedRow) => number, u: 'pcs' | 'm') => rows.filter(r => unitOf(r) === u).reduce((a, r) => a + f(r), 0);
const totalLine = (rows: ReceivedRow[]) => {
  const rp = sum(rows, r => r.pcs_rejected, 'pcs'), rm = sum(rows, r => r.pcs_rejected, 'm');
  return `${mixedQty(sum(rows, r => r.pcs_ok, 'pcs'), sum(rows, r => r.pcs_ok, 'm'))} OK${rp || rm ? ` · ${mixedQty(rp, rm)} rejected` : ''}`;
};
const amountOf = (r: ReceivedRow) => Math.round(r.pcs_ok * (Number(r.job?.rate) || 0) * 100) / 100;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function renderReceivedOn(d: {
  date: string; vendor: string | null; rows: ReceivedRow[]; names: Record<string, string>;
  progress: Record<string, JobProgress>; photos: Record<string, HTMLImageElement | null>; money: boolean;
}): HTMLCanvasElement {
  const doc = new Doc();
  const groups = new Map<string, ReceivedRow[]>();
  for (const r of d.rows) { const v = r.job?.vendor_name ?? '—'; groups.set(v, [...(groups.get(v) ?? []), r]); }
  head(doc, 'Jobwork — received', fmtDate(d.date), d.vendor ?? 'All jobworkers');
  doc.y += 26; doc.text(totalLine(d.rows) + (d.money ? `  ·  ${inr(d.rows.reduce((a, r) => a + amountOf(r), 0))}` : ''), PAD, 17, 800);
  doc.y += 18; doc.text(`${d.rows.length} receipt${d.rows.length === 1 ? '' : 's'} from ${groups.size} jobworker${groups.size === 1 ? '' : 's'}`, PAD, 11, 400, C.mid);
  for (const [vendor, rows] of groups) {
    doc.y += 18; doc.band(30); doc.y += 20;
    doc.text(vendor, PAD + 12, 13, 800); doc.text(totalLine(rows), W - PAD - 12, 11, 600, C.mid, 'right');
    doc.y += 10;
    for (const r of rows) {
      const j = r.job, u = unitOf(r), p = d.progress[r.order_id], photo = j ? d.photos[j.sku] ?? null : null;
      const x = photo ? PAD + PH + 14 : PAD, top = doc.y + 10;
      if (photo) { doc.y = top; doc.image(photo, PAD, PH); }
      doc.y = top + 13; doc.text(`${j?.sku ?? '—'}  ·  JW #${j?.jw_number ?? '—'}`, x, 14, 800, C.ink, 'left', W - PAD - x - 120);
      doc.text(`${qty(r.pcs_ok)} ${u} OK`, W - PAD, 14, 800, C.green, 'right');
      doc.y += 17; doc.text(`${j?.job_type ?? ''}${j?.component ? ' · ' + j.component : ''}${p && j ? ` · job today ${qty(p.ok)} of ${qty(j.pieces)} ${u} OK, ${p.remaining > 0 ? `${qty(p.remaining)} still out` : 'all back'}` : ''}`, x, 11, 400, C.mid, 'left', W - PAD - x - 120);
      if (r.pcs_rejected) doc.text(`${qty(r.pcs_rejected)} ${u} rejected`, W - PAD, 11, 700, C.red, 'right');
      const extra = [r.lines.length ? `Material back: ${r.lines.map(l => `${l.name} ${qty(l.qty)} ${l.unit}`.trim()).join(', ')}` : '', r.note ? `Note: ${r.note}` : ''].filter(Boolean).join('   ·   ');
      if (extra) { doc.y += 16; doc.text(extra, x, 11, 400, C.ink, 'left', W - PAD - x); }
      doc.y += 16; doc.text(`Entered by ${(r.created_by && d.names[r.created_by]) || '—'} at ${timeOf(r.created_at)}`, x, 10, 400, C.soft);
      if (d.money && j) doc.text(`${inr(j.rate)}/${u === 'm' ? 'm' : 'pc'} · ${inr(amountOf(r))}`, W - PAD, 11, 700, C.ink, 'right');
      doc.y = Math.max(doc.y, photo ? top + PH : 0) + 12; doc.rule();
    }
    if (d.money) { doc.y += 20; doc.text(`${vendor}: ${inr(rows.reduce((a, r) => a + amountOf(r), 0))}`, W - PAD, 12, 800, C.ink, 'right'); }
  }
  return doc.render();
}
