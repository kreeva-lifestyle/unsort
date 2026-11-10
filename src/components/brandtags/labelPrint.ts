// The label print page for Brand Tags (1.97 × 2.97 in, CODE128). Moved out of
// pages/BrandTags.tsx unchanged.
//
// Bundle JsBarcode instead of loading it from a CDN inside the print iframe. A
// remote <script> with no SRI ran third-party code in the app's own origin every
// time a label printed; inlining the already-installed dependency removes that
// CDN-compromise surface and makes label printing work offline. `?raw` gives the
// minified source as a string at build time. Any literal `</script` inside it
// would close the iframe's <script> early, so neutralise it once here.
import jsBarcodeSrc from 'jsbarcode/dist/JsBarcode.all.min.js?raw';
import { escHtml } from '../../lib/escape';
import { fileDate, docTitle } from '../../lib/exportName';
import type { BrandTagRow } from './tagModel';

const JSBARCODE_INLINE = jsBarcodeSrc.replace(/<\/script/gi, '<\\/script');

// ── Build label print HTML (rendered inside an in-app iframe instead of a popup) ─
const esc = escHtml;

// Serialize data for embedding INSIDE an inline <script>. JSON.stringify alone
// is unsafe there: it leaves `<` intact, so a value containing `</script>` closes
// the tag and injects markup (a SKU is user data, bulk-imported from Excel).
// Escaping the `<` character keeps the JS-array literal valid while making that
// impossible; U+2028/U+2029 are also escaped as they're illegal in JS string
// literals. The invalid-barcode fallback in the script uses textContent, never
// innerHTML, so the values are never parsed as HTML at runtime either.
const scriptJson = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export const buildLabelsHtml = (labels: BrandTagRow[]): string => {
  const html = labels.map(r => {
    const brand = r.brand.replace(/^BRAND NAME:\s*/i, '').trim().toUpperCase();
    const product = r.product.replace(/^PRODUCT DESC:\s*/i, '').trim();
    const qty = r.qty.replace(/^INCLUDES:\s*/i, '').trim();
    const mrp = '\u20B9' + r.mrp.toLocaleString('en-IN');
    return `<div class="label">
  <div class="main">
    <div class="row b">BRAND NAME: ${esc(brand)}</div>
    <div class="row b">SKU: ${esc(r.sku)}</div>
    <div class="row">PRODUCT DESC: ${esc(product)}</div>
    <div class="row">${esc(qty)}</div>
    <div class="row">SIZE: ${esc(r.size)}</div>
    <div class="row">COLOR: ${esc(r.color)}</div>
    <div class="row b">MRP: ${esc(mrp)}</div>
    <div class="row sm">MKTD &amp; DIST. BY: ${esc(r.mktd)}</div>
    <div class="row">JIO CODE: ${esc(r.jioCode)}</div>
    <div class="barcode"><svg id="bc-${esc(r.id)}"></svg></div>
  </div>
  <div class="ean"><span>EAN: ${esc(r.sku)}</span></div>
</div>`;
  }).join('');
  return `<!DOCTYPE html><html><head>
<title>${esc(docTitle('Brand-Tags', labels.length === 1 ? labels[0].sku : `${labels.length}-labels`, fileDate()))}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000}
.label{width:1.97in;height:2.97in;display:flex;overflow:hidden;page-break-after:always}
.main{flex:1;padding:6px 7px 4px;display:flex;flex-direction:column}
.row{font-size:7.5pt;line-height:1.35;margin-bottom:2px}
.b{font-weight:700;font-size:8pt}
.sm{font-size:6pt;line-height:1.2;color:#222}
.barcode{margin-top:auto;text-align:center;padding:4px 0 2px}
.barcode svg{width:100%;height:36px}
.ean{width:26px;min-width:26px;background:#e8e8e8;display:flex;align-items:center;justify-content:center}
.ean span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-weight:900;font-size:9pt;font-family:Arial,sans-serif;color:#000;letter-spacing:1px}
@media print{
  @page{margin:0;size:1.97in 2.97in}
  body{margin:0}
  .label{width:100%;height:100%;border:none}.label:last-child{page-break-after:auto}
}
@media screen{.label{border:1px solid #ccc;margin:8px auto}}
</style>
<script>${JSBARCODE_INLINE}<\/script>
</head><body>${html}
<script>
document.querySelectorAll('.barcode svg').forEach(function(svg){
  var id=svg.id.replace('bc-','');
  var row=${scriptJson(labels.map(r => ({ id: r.id, jio: r.jioCode, sku: r.sku })))}.find(function(r){return r.id===id});
  if(row&&row.jio)try{JsBarcode(svg,row.jio,{format:'CODE128',width:1.5,height:34,displayValue:true,text:row.sku,fontSize:8,font:'Arial',margin:0,textMargin:1})}catch(e){if(svg){var d=document.createElement('div');d.style.cssText='color:#c00;font-size:10px;border:1px dashed #c00;padding:4px;text-align:center';d.textContent='[Invalid barcode: '+(row.sku||row.jio||'?')+']';svg.replaceWith(d);}}
});
<\/script></body></html>`;
};
