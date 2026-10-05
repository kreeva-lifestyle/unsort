// Share a jobwork statement through the phone's share sheet (WhatsApp…),
// falling back to a download on desktop — same flow as the costing and PO
// shares. Failures toast; a missing photo just leaves the box out.
import { friendlyError } from '../../../lib/friendlyError';
import { exportName } from '../../../lib/exportName';
import { loadForCanvas } from '../costing/costingShare';
import { skuThumbUrl } from '../../../lib/skuThumbs';
import { renderJobStatement, renderVendorStatement } from './jobworkImage';
import { loadVendorOpen } from './jobworkApi';
import type { JobDetail } from './jobworkModel';

type Toast = (m: string, t?: string) => void;

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) =>
  c.toBlob(b => (b ? res(b) : rej(new Error('Could not render the image'))), 'image/jpeg', 0.92));

async function send(blob: Blob, name: string, title: string, addToast: Toast) {
  const file = new File([blob], name, { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try { await nav.share({ files: [file], title, text: title }); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') addToast('Sharing failed — try again', 'error'); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  addToast('Sharing not supported here — image downloaded', 'success');
}

export async function shareJob(d: JobDetail, money: boolean, photoUrl: string | null, addToast: Toast) {
  let blob: Blob;
  try {
    // The SKU's Dropbox thumbnail first, the costing sheet's photo after.
    const thumb = await skuThumbUrl(d.job.sku);
    const photo = (thumb ? await loadForCanvas(thumb) : null) ?? (photoUrl ? await loadForCanvas(photoUrl) : null);
    blob = await toBlob(renderJobStatement(d, money, photo));
  } catch (e) { addToast(friendlyError(e, 'Could not build the statement image'), 'error'); return; }
  await send(blob, exportName('Jobwork', [`JW${d.job.jw_number}`, d.job.sku], 'jpg'), `Jobwork JW #${d.job.jw_number} — ${d.job.sku}`, addToast);
}

export async function shareVendor(vendor: string, money: boolean, addToast: Toast) {
  const { details, error } = await loadVendorOpen(vendor);
  if (error) { addToast(friendlyError(error), 'error'); return; }
  if (!details.length) { addToast(`No open jobs with ${vendor}`, 'error'); return; }
  let blob: Blob;
  try {
    // One small thumbnail per job (cached, 256px) — a missing one leaves its box out.
    const photos = await Promise.all(details.map(async d => { const u = await skuThumbUrl(d.job.sku); return u ? loadForCanvas(u) : null; }));
    blob = await toBlob(renderVendorStatement(vendor, details, money, photos));
  }
  catch (e) { addToast(friendlyError(e, 'Could not build the statement image'), 'error'); return; }
  await send(blob, exportName('Jobwork', [vendor, 'open'], 'jpg'), `Jobwork pending — ${vendor}`, addToast);
}
