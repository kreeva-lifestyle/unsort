// Exactly one A4 page: render the sheet in a hidden frame at A4 width,
// measure it against the printable height, and when it overflows walk the
// ladder in sheetHtml (smaller pictures → smaller type → no hints →
// shorter notes), re-measuring after each step. Measurements and choices
// are never dropped; if the last step still overflows the caller is told.
import { FIT_START, FIT_STEPS, type Fit } from './sheetHtml';

const A4_W_PX = Math.round(210 / 25.4 * 96);          // 794
const PRINTABLE_H_PX = Math.round(277 / 25.4 * 96) - 8; // 297mm − 2×10mm margins, minus a hair for rounding

async function measure(html: string): Promise<number> {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = `position:fixed;left:-${A4_W_PX + 50}px;top:0;width:${A4_W_PX}px;height:1200px;border:0;visibility:hidden`;
  document.body.appendChild(f);
  try {
    await new Promise<void>(res => { f.onload = () => res(); f.srcdoc = html; });
    const doc = f.contentDocument!;
    try { await (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* no font API */ }
    await Promise.all(Array.from(doc.images).filter(i => !i.complete).map(i => new Promise(res => { i.onload = i.onerror = () => res(null); })));
    return doc.querySelector('.page')?.getBoundingClientRect().height ?? doc.documentElement.scrollHeight;
  } finally { f.remove(); }
}

export async function fitToOnePage(build: (fit: Fit) => string): Promise<{ html: string; fit: Fit; fits: boolean; height: number }> {
  let fit: Fit = { ...FIT_START };
  let html = build(fit);
  let h = await measure(html);
  for (const step of FIT_STEPS) {
    if (h <= PRINTABLE_H_PX) break;
    fit = { ...fit, ...step };
    html = build(fit);
    h = await measure(html);
  }
  return { html, fit, fits: h <= PRINTABLE_H_PX, height: h };
}
