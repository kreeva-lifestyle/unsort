// The illustrations on one form page, top to bottom: every picture drawn on
// the page that is big enough to be a measurement photo or diagram (tiles,
// radio circles and icons are skipped by their pixel size before decoding),
// with where it sits on the page. A page-sized image is a scan of the page,
// not an illustration, and is skipped too. Each picture is drawn on white,
// cropped to its content, scaled to at most MAX_EDGE px and hashed, so the
// same picture is stored once however many forms carry it.
import { logSwallowed } from '../../../lib/errorLogger';

export interface PageImage { top: number; area: number; blob: Blob; hash: string }

const MIN_PX = 120;      // smaller than this is a tile, an icon or a radio circle
const MIN_AREA_PT = 3600; // drawn smaller than ~2 × 2 cm on the page: a logo or a button, not a measurement picture
const MAX_EDGE = 640;    // stored size: enough for a 30 mm card on A4
const MAX_PER_PAGE = 6;

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('canvas'))), 'image/jpeg', 0.85));
const sha1 = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');

/** Draw a decoded pdf.js image on white at ≤ MAX_EDGE, crop to its content; null when it is blank. */
function render(img: any, w: number, h: number): HTMLCanvasElement | null {
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0, c.width, c.height);
  else if (img.data) {
    const n = w * h, src: Uint8ClampedArray = img.data, out = new Uint8ClampedArray(n * 4), ch = src.length / n;
    for (let i = 0; i < n; i++) { const o = i * 4; if (ch >= 3) { out[o] = src[i * ch]; out[o + 1] = src[i * ch + 1]; out[o + 2] = src[i * ch + 2]; out[o + 3] = ch === 4 ? src[i * ch + 3] : 255; } else { out[o] = out[o + 1] = out[o + 2] = src[i]; out[o + 3] = 255; } }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    tmp.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0); ctx.drawImage(tmp, 0, 0, c.width, c.height);
  } else return null;
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const o = (y * c.width + x) * 4; if (d[o] < 240 || d[o + 1] < 240 || d[o + 2] < 240) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) return null;
  const m = 4, cx = Math.max(0, x0 - m), cy = Math.max(0, y0 - m), cw = Math.min(c.width - cx, x1 - x0 + 1 + 2 * m), chh = Math.min(c.height - cy, y1 - y0 + 1 + 2 * m);
  const out = document.createElement('canvas'); out.width = cw; out.height = chh;
  out.getContext('2d')!.drawImage(c, cx, cy, cw, chh, 0, 0, cw, chh);
  return out;
}

export async function pageImages(page: any, OPS: Record<string, number>): Promise<PageImage[]> {
  const ops = await page.getOperatorList();
  const [, , pw, ph] = page.view as number[];
  const found: { id: string; w: number; h: number; top: number; area: number }[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(a?.[0]) && a[0].length === 6) ctm = mul(ctm, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject && a?.[1] >= MIN_PX && a?.[2] >= MIN_PX) {
      const dw = Math.hypot(ctm[0], ctm[1]), dh = Math.hypot(ctm[2], ctm[3]);
      if (dw * dh > pw * ph * 0.7 || dw * dh < MIN_AREA_PT) continue;   // a scanned page, or a logo/button
      found.push({ id: a[0], w: a[1], h: a[2], top: ph - (ctm[5] + Math.max(0, ctm[3])), area: dw * dh });
    }
  }
  found.sort((x, y) => x.top - y.top);
  const out: PageImage[] = [];
  for (const f of found.slice(0, MAX_PER_PAGE)) {
    try {
      const store = page.commonObjs.has(f.id) ? page.commonObjs : page.objs;
      const img = await new Promise<any>(res => store.get(f.id, res));
      const c = img && render(img, f.w, f.h);
      if (!c) continue;
      const blob = await toBlob(c);
      out.push({ top: f.top / ph, area: f.area, blob, hash: await sha1(blob) });
    } catch (e) { logSwallowed('form picture', e); }
  }
  return out;
}
