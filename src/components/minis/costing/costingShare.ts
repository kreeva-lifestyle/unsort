// Share a product costing as an image (phone share sheet; download on
// desktop), mirroring sharePoImage. Loads the product photo and attached
// photos with CORS enabled — Supabase storage answers with
// access-control-allow-origin: *, which is what lets a canvas with these
// photos export at all — then paints costingImage.ts and hands the JPEG to
// navigator.share. A photo that cannot be loaded is drawn as a grey
// "photo unavailable" box and counted in a toast, never a silent gap.
import type { CostingProduct } from './costingModel';
import { isImage } from './attachmentsStore';
import { exportName } from '../../../lib/exportName';
import { renderCostingImage, type LoadedImages } from './costingImage';

const LOAD_MS = 20_000;

/** Load an image for canvas use. The `share` query param makes this a fresh
 *  CORS request rather than a reuse of the editor's non-CORS cached copy,
 *  which some browsers refuse to paint. */
export const loadForCanvas = (url: string): Promise<HTMLImageElement | null> => new Promise(res => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const done = (ok: boolean) => { clearTimeout(t); res(ok ? img : null); };
  const t = setTimeout(() => done(false), LOAD_MS);
  img.onload = () => done(true);
  img.onerror = () => done(false);
  img.src = url.startsWith('data:') || url.startsWith('blob:') ? url : `${url}${url.includes('?') ? '&' : '?'}share=1`;
});

export async function loadCostingImages(p: CostingProduct): Promise<{ imgs: LoadedImages; missing: number }> {
  const [product, attachments] = await Promise.all([
    p.image_url ? loadForCanvas(p.image_url) : Promise.resolve(null),
    Promise.all((p.attachments ?? []).map(async a => ({ a, img: isImage(a) ? await loadForCanvas(a.url) : null }))),
  ]);
  const missing = (p.image_url && !product ? 1 : 0) + attachments.filter(x => isImage(x.a) && !x.img).length;
  return { imgs: { product, attachments }, missing };
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) =>
  c.toBlob(b => (b ? res(b) : rej(new Error('Could not render the image'))), 'image/jpeg', 0.92));

export async function shareCostingImage(p: CostingProduct, addToast: (m: string, t?: string) => void): Promise<void> {
  let blob: Blob;
  try {
    const { imgs, missing } = await loadCostingImages(p);
    if (missing) addToast(`${missing} photo${missing === 1 ? '' : 's'} could not be loaded — shown as grey boxes`, 'error');
    blob = await toBlob(renderCostingImage(p, imgs));
  } catch { addToast('Could not build the costing image', 'error'); return; }
  const sku = p.sku.trim().toUpperCase();
  const file = new File([blob], exportName('Costing', [sku], 'jpg'), { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try { await nav.share({ files: [file], title: `Product costing ${sku}`, text: `Product costing — ${sku}` }); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') addToast('Sharing was cancelled', 'error'); }
    return;
  }
  // Desktop / unsupported: download the image
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  addToast('Sharing not supported here — image downloaded', 'success');
}
