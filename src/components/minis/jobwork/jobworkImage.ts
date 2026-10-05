// Jobwork statement as an image (white document, like the PO share). One
// job: identity, pieces ordered / received / rejected / remaining, material
// sent / returned / with them, and every movement with its date. A
// jobworker statement: each open job in brief plus the totals. Money (rate,
// bill, paid, due, payments) appears only when asked for — the default copy
// can go to the jobworker's supervisor.
import type { JobDetail } from './jobworkModel';
import { materialBalances, timeline, linesText, fmtDate, today, shortDate, qty, unitShort, inr, n, PAY_MODE_LABELS, workState } from './jobworkModel';

const SANS = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const W = 760, PAD = 36, SS = 2;
const C = { ink: '#111827', mid: '#4B5563', soft: '#9CA3AF', line: '#E5E7EB', band: '#F3F4F6', green: '#047857', red: '#B91C1C', amber: '#B45309' };
type Op = (ctx: CanvasRenderingContext2D) => void;

/** Lays text out top-down; ops are replayed on a canvas of the final height. */
class Doc {
  y = PAD; ops: Op[] = [];
  text(s: string, x: number, size: number, weight = 400, color = C.ink, align: CanvasTextAlign = 'left', maxW = W - 2 * PAD) {
    const y = this.y;
    this.ops.push(ctx => {
      ctx.font = `${weight} ${size}px ${SANS}`; ctx.fillStyle = color; ctx.textAlign = align;
      let t = s;
      while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + '…';
      ctx.fillText(t, x, y);
    });
  }
  rule(color = C.line) { const y = this.y; this.ops.push(ctx => { ctx.fillStyle = color; ctx.fillRect(PAD, y, W - 2 * PAD, 1); }); }
  band(h: number) { const y = this.y; this.ops.push(ctx => { ctx.fillStyle = C.band; ctx.fillRect(PAD, y, W - 2 * PAD, h); }); }
  image(img: HTMLImageElement, x: number, size: number) {
    const y = this.y;
    this.ops.push(ctx => {
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, size, size);
    });
  }
  render(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    const h = this.y + PAD;
    c.width = W * SS; c.height = h * SS;
    const ctx = c.getContext('2d')!;
    ctx.scale(SS, SS); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, h); ctx.textBaseline = 'alphabetic';
    this.ops.forEach(op => op(ctx));
    return c;
  }
}

function head(doc: Doc, title: string, right: string, sub: string) {
  doc.y += 22; doc.text('Arya Designs', PAD, 24, 700); doc.text(right, W - PAD, 16, 700, C.ink, 'right');
  doc.y += 18; doc.text(title, PAD, 12, 400, C.mid); doc.text(sub, W - PAD, 12, 400, C.mid, 'right');
  doc.y += 16; doc.rule(C.ink); doc.y += 8;
}

function piecesRow(doc: Doc, d: JobDetail) {
  const j = d.job, cols: [string, number, string][] = [
    ['Ordered', j.pieces, C.ink], ['Received OK', j.pcs_ok, C.green],
    ['Rejected', j.pcs_rejected - j.pcs_rework, j.pcs_rejected - j.pcs_rework ? C.red : C.soft], ['Remaining', j.pcs_remaining, j.pcs_remaining ? C.amber : C.soft],
  ];
  doc.band(54); const w = (W - 2 * PAD) / 4;
  doc.y += 20; cols.forEach(([l], i) => doc.text(l.toUpperCase(), PAD + 14 + i * w, 9, 700, C.soft));
  doc.y += 24; cols.forEach(([, v, c], i) => doc.text(String(v), PAD + 14 + i * w, 20, 800, c));
  doc.y += 18;
}

function materialTable(doc: Doc, d: JobDetail) {
  const rows = materialBalances(d, d.job.pcs_ok);
  if (!rows.length) return;
  const xs = [PAD, PAD + 330, PAD + 430, PAD + 530, W - PAD];
  doc.y += 10; doc.text('MATERIAL', xs[0], 9, 700, C.soft);
  ['SENT', 'RETURNED', 'USED', 'WITH THEM'].forEach((h, i) => doc.text(h, xs[i + 1] + (i === 3 ? 0 : 70), 9, 700, C.soft, 'right'));
  doc.y += 6; doc.rule();
  for (const b of rows) {
    const u = unitShort(b.m.unit), over = b.used != null && b.held < -1e-9;
    doc.y += 20;
    doc.text(b.m.name + (b.m.per_piece != null ? `  (${qty(b.m.per_piece)} ${u}/pc)` : ''), xs[0], 12, 600, C.ink, 'left', 320);
    doc.text(`${qty(b.sent)} ${u}`, xs[1] + 70, 12, 400, C.mid, 'right');
    doc.text(`${qty(b.returned)} ${u}`, xs[2] + 70, 12, 400, C.mid, 'right');
    doc.text(b.used == null ? '—' : `${qty(b.used)} ${u}`, xs[3] + 70, 12, 400, C.mid, 'right');
    doc.text(over ? `over ${qty(-b.held)} ${u}` : `${qty(b.held)} ${u}`, xs[4], 12, 700, over ? C.red : C.ink, 'right');
  }
  doc.y += 8; doc.rule();
}

function moneyLine(doc: Doc, d: JobDetail) {
  const j = d.job;
  doc.y += 22;
  doc.text(`Rate ${inr(j.rate)}/pc   ·   Bill ${inr(j.bill)} (${j.pcs_ok} pcs OK)   ·   Paid ${inr(j.paid)}`, PAD, 12, 400, C.mid);
  doc.text(`Due ${inr(j.due)}`, W - PAD, 14, 800, n(j.due) > 0 ? C.amber : C.green, 'right');
}

/** One job, full statement with dated movements. */
export function renderJobStatement(d: JobDetail, money: boolean, photo: HTMLImageElement | null): HTMLCanvasElement {
  const doc = new Doc(), j = d.job;
  head(doc, 'Jobwork statement', `JW #${j.jw_number}`, `as of ${fmtDate(today())}`);
  const top = doc.y + 4, tx = photo ? PAD + 96 : PAD;
  if (photo) { doc.y = top; doc.image(photo, PAD, 84); }
  doc.y = top + 22; doc.text(j.sku, tx, 22, 800);
  doc.y += 22; doc.text(`${j.job_type}${j.component ? ' · ' + j.component.toUpperCase() : ''}`, tx, 13, 400, C.mid);
  doc.y += 20; doc.text(`Jobworker: ${j.vendor_name}${j.vendor_phone ? ' · ' + j.vendor_phone : ''}`, tx, 13, 600);
  doc.y += 18; doc.text(`Given ${fmtDate(j.job_date)}${j.expected_date ? '   ·   due back ' + fmtDate(j.expected_date) : ''}   ·   ${workState(j).label}`, tx, 11, 400, C.mid);
  doc.y = Math.max(doc.y, photo ? top + 84 : 0) + 16;
  piecesRow(doc, d);
  materialTable(doc, d);
  doc.y += 26; doc.text('WHAT MOVED, AND WHEN', PAD, 9, 700, C.soft); doc.y += 6; doc.rule();
  const rows = timeline(d).filter(r => money || r.kind !== 'pay');
  if (!rows.length) { doc.y += 20; doc.text('Nothing sent or received yet.', PAD, 12, 400, C.soft); }
  for (const r of rows) {
    doc.y += 20; doc.text(fmtDate(r.date), PAD, 12, 600, C.ink);
    let t = '';
    if (r.kind === 'pay') t = `Paid ${inr(r.pay.amount)} · ${PAY_MODE_LABELS[r.pay.mode]}${r.pay.reference ? ' · ' + r.pay.reference : ''}`;
    else {
      const e = r.entry, m = linesText(e.jobwork_entry_lines, d.materials);
      if (r.kind === 'out') t = (e.pcs_rework ? `Sent back ${e.pcs_rework} pcs for rework` : 'Sent') + (m ? ` ${m}` : '');
      else t = [e.pcs_ok ? `Received ${e.pcs_ok} OK` : '', e.pcs_rejected ? `${e.pcs_rejected} rejected` : '', m ? `returned ${m}` : ''].filter(Boolean).join(', ');
      if (e.note) t += ` — ${e.note}`;
    }
    doc.text(t, PAD + 110, 12, 400, r.kind === 'in' ? C.green : r.kind === 'pay' ? C.amber : C.ink, 'left', W - 2 * PAD - 110);
  }
  doc.y += 10; doc.rule();
  if (money) moneyLine(doc, d);
  if (j.notes) { doc.y += 24; doc.text(`Note: ${j.notes}`, PAD, 11, 400, C.mid); }
  return doc.render();
}

/** All open jobs of one jobworker, in brief, with totals; photos[i] is job i's thumbnail. */
export function renderVendorStatement(vendor: string, list: JobDetail[], money: boolean, photos: (HTMLImageElement | null)[] = []): HTMLCanvasElement {
  const doc = new Doc();
  const phone = list.find(d => d.job.vendor_phone)?.job.vendor_phone;
  head(doc, `Pending with ${vendor}${phone ? ' · ' + phone : ''}`, `${list.length} open job${list.length === 1 ? '' : 's'}`, `as of ${fmtDate(today())}`);
  const PH = 56;
  list.forEach((d, i) => {
    const j = d.job, photo = photos[i] ?? null, x = photo ? PAD + PH + 14 : PAD, top = doc.y + 10;
    if (photo) { doc.y = top; doc.image(photo, PAD, PH); }
    doc.y = top + 12; doc.text(`${j.sku}  ·  JW #${j.jw_number}`, x, 15, 800);
    doc.text(`${j.pcs_remaining} of ${j.pieces} pcs pending`, W - PAD, 13, 700, j.pcs_remaining ? C.amber : C.green, 'right');
    doc.y += 18; doc.text(`${j.job_type}${j.component ? ' · ' + j.component.toUpperCase() : ''} · given ${shortDate(j.job_date)}${j.expected_date ? ' · due ' + shortDate(j.expected_date) : ''} · ${j.pcs_ok} OK, ${j.pcs_rejected - j.pcs_rework} rejected${j.last_entry_date ? ' · last movement ' + shortDate(j.last_entry_date) : ''}`, x, 11, 400, C.mid, 'left', W - PAD - x);
    const held = materialBalances(d, j.pcs_ok).filter(b => Math.abs(b.held) > 1e-9);
    if (held.length) { doc.y += 17; doc.text('With them: ' + held.map(b => `${qty(b.held)} ${unitShort(b.m.unit)} ${b.m.name}`).join(' · '), x, 11, 600, C.ink, 'left', W - PAD - x); }
    if (money) { doc.y += 17; doc.text(`Bill ${inr(j.bill)} · Paid ${inr(j.paid)} · Due ${inr(j.due)}`, x, 11, 400, C.mid); }
    doc.y = Math.max(doc.y, photo ? top + PH : 0) + 12; doc.rule();
  });
  const pend = list.reduce((t, d) => t + d.job.pcs_remaining, 0);
  doc.y += 24; doc.text(`Pieces pending: ${pend}`, PAD, 14, 800);
  if (money) doc.text(`Balance due ${inr(list.reduce((t, d) => t + n(d.job.due), 0))}`, W - PAD, 14, 800, C.amber, 'right');
  return doc.render();
}
