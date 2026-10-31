// The one-page A4 Hindi tailor sheet, as HTML for the print preview and the
// print queue. Layout: header (title, order, product, tier) → upper-body
// measurement cards with the form's own illustration → lower-body cards →
// the design choices and the customer's notes → warnings → footer. The
// `Fit` knobs (image height, base font, hints, note length) are what
// fitSheet steps through until the page measures as one A4.
// Every value goes through escHtml; the footer comes from settings, never
// from the form. Devanagari is shaped by the bundled Noto Sans Devanagari.
import { escHtml } from '../../../lib/escape';
import type { Extraction, Measurement, Choice } from './types';
import { GARMENT_HI } from './types';

export interface Fit { imgH: number; font: number; hints: boolean; notesMax: number | null }
export const FIT_START: Fit = { imgH: 122, font: 14, hints: true, notesMax: null };
/** The ladder, one step at a time: pictures smaller → type smaller → hints off → notes shortened. Never a column or a field. */
export const FIT_STEPS: Partial<Fit>[] = [{ imgH: 104 }, { imgH: 88 }, { imgH: 72 }, { font: 13 }, { font: 12 }, { hints: false }, { notesMax: 160 }];

export interface SheetInput { ex: Extraction; diagramUrl: (m: Measurement) => string | null; title: string; footer: string; fit?: Fit }

const LOWER = new Set(['waist', 'hip', 'lehenga_length', 'skirt_length', 'bottom_length', 'bottom_round', 'thigh', 'knee', 'calf', 'ankle', 'inseam', 'crotch']);
const isLower = (m: Measurement) => m.section === 'lower' || (m.section !== 'upper' && LOWER.has(m.key));
const hasNum = (m: Measurement) => m.value !== null && m.value !== undefined;
const val = (m: Measurement) => (hasNum(m) ? `${m.value}${m.unit === 'cm' ? ' cm' : '"'}` : '—');
const UNANSWERED = 'ग्राहक ने नहीं चुना — मॉडल फ़ोटो / एम्ब्रॉयडरी के अनुसार रखें';

function card(m: Measurement, url: string | null, fit: Fit): string {
  const low = m.confidence === 'low' ? '<span class="chk">❓ जाँचें</span>' : '';
  const v = hasNum(m) || !m.value_text_hi ? `<div class="val">${escHtml(val(m))}${low}</div>` : `<div class="val txt">${escHtml(m.value_text_hi)}${low}</div>`;
  return `<div class="card">${url ? `<img src="${escHtml(url)}" alt="">` : '<div class="noimg"></div>'}<div class="lbl">${escHtml(m.label_hi)}</div>${fit.hints && m.hint_hi ? `<div class="hint">${escHtml(m.hint_hi)}</div>` : ''}${v}</div>`;
}

function choiceRow(c: Choice): string {
  const low = c.confidence === 'low' ? ' <span class="chk">❓ जाँचें</span>' : '';
  const v = c.answered && (c.value_hi || c.value_en) ? `${escHtml(c.value_hi || c.value_en)}${c.value_en && c.value_hi && c.value_en !== c.value_hi ? ` <span class="en">(${escHtml(c.value_en)})</span>` : ''}` : `<span class="unans">${UNANSWERED}</span>`;
  return `<tr><th>${escHtml(c.label_hi || c.key)}</th><td>${v}${low}</td></tr>`;
}

export function sheetHtml({ ex, diagramUrl, title, footer, fit = FIT_START }: SheetInput): string {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  // One "sleeveless" card replaces the sleeve cards only when every sleeve answer agrees (a number or another answer keeps them, and the contradiction stays visible).
  const sleeves = ex.measurements.filter(m => /^sleeve/.test(m.key));
  const saysSleeveless = (t?: string) => /sleeveless|स्लीवलेस/i.test(t || '');
  const sleeveless = ex.choices.some(c => /sleeve/i.test(c.key) && saysSleeveless(`${c.value_en} ${c.value_hi}`)) && sleeves.every(m => !hasNum(m) && (!m.value_text_en || saysSleeveless(`${m.value_text_en} ${m.value_text_hi}`)));
  const upper = ex.measurements.filter(m => !isLower(m) && !(sleeveless && /^sleeve/.test(m.key)));
  const lower = ex.measurements.filter(isLower);
  const upperCards = upper.map(m => card(m, diagramUrl(m), fit)).join('') + (sleeveless ? '<div class="card sl"><div class="val">स्लीवलेस</div><div class="hint">बिना बाँह</div></div>' : '');
  const n = upper.length + (sleeveless ? 1 : 0);
  const cols = n >= 9 ? 5 : n >= 7 ? 4 : 3; // no row of one lonely card
  const notes = ex.notes.map(n => {
    const t = fit.notesMax && n.text_hi.length > fit.notesMax ? `${escHtml(n.text_hi.slice(0, fit.notesMax))}… <span class="en">पूरा नोट मूल फ़ॉर्म में</span>` : escHtml(n.text_hi);
    return `<tr><th>ग्राहक का नोट</th><td>${t}${n.text_original && n.text_original !== n.text_hi && !fit.notesMax ? `<div class="en">${escHtml(n.text_original)}</div>` : ''}</td></tr>`;
  }).join('');
  const warn = ex.warnings.filter(w => w.severity !== 'info');
  const info = ex.warnings.filter(w => w.severity === 'info');
  const tierRaw = ex.order.stitching_tier_hi || ex.order.stitching_tier;
  const tier = /^(none|unknown|n\/?a|not (stated|given|mentioned).*)?$/i.test((tierRaw || '').trim()) ? '' : tierRaw;   // no pill when the form does not say
  return `<!DOCTYPE html><html lang="hi"><head><meta charset="utf-8"><title>${escHtml(ex.order.order_no)} tailor sheet</title><style>
@font-face{font-family:'Noto Sans Devanagari';font-weight:400;src:url(${origin}/fonts/noto-sans-devanagari-devanagari-400-normal.woff2) format('woff2')}
@font-face{font-family:'Noto Sans Devanagari';font-weight:700;src:url(${origin}/fonts/noto-sans-devanagari-devanagari-700-normal.woff2) format('woff2')}
@page{size:A4;margin:10mm}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#fff;color:#111}
body{font-family:'Noto Sans Devanagari','Nirmala UI','Kohinoor Devanagari','Noto Sans',Arial,sans-serif;font-size:${fit.font}px;line-height:1.35}
.page{width:190mm;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px}
.head h1{font-size:1.15em;font-weight:700}.head .sub{font-size:.8em;color:#555;margin-top:2px}
.ord{text-align:right}.ord .no{font-size:1.6em;font-weight:700;letter-spacing:.02em}.ord .prod{font-size:.9em;margin-top:2px;max-width:85mm}
.pill{display:inline-block;margin-top:4px;padding:2px 8px;border:1px solid #111;border-radius:999px;font-size:.75em;font-weight:700}
h2{font-size:.8em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#333;margin:6px 0 4px;border-left:3px solid #111;padding-left:6px}
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:5px}.grid.lower{grid-template-columns:repeat(3,1fr)}
.card{border:1px solid #bbb;border-radius:6px;padding:4px 6px;text-align:center;break-inside:avoid}
.card img,.card .noimg{display:block;width:100%;height:${fit.imgH}px;object-fit:contain;margin:0 auto 2px}
.card .noimg{height:${Math.round(fit.imgH * 0.35)}px}
.card .lbl{font-weight:700;font-size:.95em}.card .hint{font-size:.72em;color:#666}.card .val{font-size:1.55em;font-weight:700;line-height:1.2;margin-top:1px}
.card .val.txt{font-size:.95em;line-height:1.25;padding:2px 0}
.card.sl .val{font-size:1.2em;padding-top:${Math.round(fit.imgH * 0.4)}px}
table{width:100%;border-collapse:collapse;margin-top:2px}th,td{border:1px solid #bbb;padding:3px 6px;vertical-align:top;text-align:left;font-size:.92em}th{width:34%;background:#f3f3f3;font-weight:700}
.en{font-size:.78em;color:#666}.unans{color:#8a5a00;font-weight:700}.chk{color:#b00;font-weight:700;font-size:.72em;margin-left:4px;white-space:nowrap}
.warn{margin-top:6px;border:1.5px solid #c70;background:#fff7e6;border-radius:6px;padding:5px 8px;font-size:.9em}.warn.block{border-color:#b00;background:#fdecec}
.warn div{padding:1px 0}.warn b{margin-right:4px}
.foot{margin-top:8px;border-top:1px solid #bbb;padding-top:4px;font-size:.72em;color:#555;display:flex;justify-content:space-between;gap:10px}
</style></head><body><div class="page">
<div class="head"><div><h1>${escHtml(title)}</h1><div class="sub">${escHtml(ex.order.form_title || '')}${ex.order.garment_type ? ` · ${escHtml(GARMENT_HI[ex.order.garment_type] || ex.order.garment_type)}` : ''}</div></div>
<div class="ord"><div class="no">${escHtml(ex.order.order_no)}</div><div class="prod">${escHtml(ex.order.product_name)}</div>${tier ? `<span class="pill">${escHtml(tier)}</span>` : ''}</div></div>
${upper.length || sleeveless ? `<h2>ऊपरी नाप</h2><div class="grid">${upperCards}</div>` : ''}
${lower.length ? `<h2>निचली नाप</h2><div class="grid lower">${lower.map(m => card(m, diagramUrl(m), fit)).join('')}</div>` : ''}
${ex.choices.length || notes ? `<h2>डिज़ाइन और निर्देश</h2><table>${ex.choices.map(choiceRow).join('')}${notes}</table>` : ''}
${warn.length ? `<div class="warn${warn.some(w => w.severity === 'blocker') ? ' block' : ''}">${warn.map(w => `<div><b>${w.severity === 'blocker' ? '⛔' : '⚠'}</b>${escHtml(w.text_hi)}</div>`).join('')}</div>` : ''}
${info.length ? `<div class="warn" style="border-color:#999;background:#f6f6f6">${info.map(w => `<div><b>ℹ</b>${escHtml(w.text_hi)}</div>`).join('')}</div>` : ''}
<div class="foot"><span>${escHtml(footer)}</span><span>${escHtml(ex.order.order_no)}</span></div>
</div></body></html>`;
}
