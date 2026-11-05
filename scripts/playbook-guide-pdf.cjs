/* eslint-disable @typescript-eslint/no-require-imports */
// Prints the Playbook Product Directory user guide.
//   node scripts/playbook-guide-pdf.cjs
// Reads the guide text from src/playbook/components/guide/content/*.ts (the
// same data the in-app Guide page shows), writes the self-contained printable
// A4 HTML to docs/playbook/product-directory-guide.html, then renders it with
// Playwright (Chromium) to public/playbook/product-directory-guide.pdf.
// Re-run after editing the guide content.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const HTML_OUT = path.join(ROOT, 'docs/playbook/product-directory-guide.html');
const PDF_OUT = path.join(ROOT, 'public/playbook/product-directory-guide.pdf');

// Load the TypeScript content files in Node: transpile each .ts on require.
require.extensions['.ts'] = (mod, filename) => {
  const src = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename });
  mod._compile(out.outputText, filename);
};
const { GUIDE_META, GUIDE_SECTIONS } = require(path.join(ROOT, 'src/playbook/components/guide/content/index.ts'));
const { splitInline } = require(path.join(ROOT, 'src/playbook/components/guide/types.ts'));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const rich = text => splitInline(text).map(s => (s.t === 'b' ? `<strong>${esc(s.v)}</strong>` : s.t === 'code' ? `<code>${esc(s.v)}</code>` : esc(s.v))).join('');

function block(b) {
  switch (b.kind) {
    case 'p': return `<p>${rich(b.text)}</p>`;
    case 'h': return `<h3>${rich(b.text)}</h3>`;
    case 'tip': return `<div class="box tip"><b>Tip</b> ${rich(b.text)}</div>`;
    case 'warn': return `<div class="box warn"><b>Note</b> ${rich(b.text)}</div>`;
    case 'list': return `<ul>${b.items.map(i => `<li>${rich(i)}</li>`).join('')}</ul>`;
    case 'steps': return `<ol class="steps">${b.items.map(i => `<li>${rich(i)}</li>`).join('')}</ol>`;
    case 'table': return `<table><thead><tr>${b.head.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
      b.rows.map(r => `<tr>${r.map(c => `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    default: throw new Error(`Unknown guide block: ${b.kind}`);
  }
}

const num = i => String(i + 1).padStart(2, '0');
const sections = GUIDE_SECTIONS.map((s, i) => `
<section id="${esc(s.id)}">
  <h2><span class="n">${num(i)}</span>${esc(s.title)}</h2>
  ${s.lead ? `<p class="lead">${rich(s.lead)}</p>` : ''}
  ${s.blocks.map(block).join('\n  ')}
</section>`).join('\n');
const toc = GUIDE_SECTIONS.map((s, i) => `<li><a href="#${esc(s.id)}"><span class="n">${num(i)}</span>${esc(s.title)}</a></li>`).join('');

// Print stylesheet: light, A4, literal colours are allowed in print templates.
const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Inter, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #1d2230; background: #fff; }
main { max-width: 180mm; margin: 0 auto; }
.cover { padding: 18mm 0 10mm; border-bottom: 3px solid; border-image: linear-gradient(90deg, #f2b632, #e2483d) 1; margin-bottom: 8mm; }
.brand { font-size: 9pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #c2410c; }
h1 { font-size: 26pt; line-height: 1.15; margin: 4mm 0 3mm; letter-spacing: -.02em; }
.sub { font-size: 12pt; color: #4b5263; margin: 0; }
.meta { font-size: 9pt; color: #7a8193; margin-top: 4mm; }
.toc { columns: 2; column-gap: 8mm; padding: 0; list-style: none; margin: 0 0 6mm; }
.toc li { break-inside: avoid; margin: 0 0 2mm; }
.toc a { color: #1d2230; text-decoration: none; }
.n { display: inline-block; min-width: 8mm; font-family: "JetBrains Mono", Menlo, Consolas, monospace; font-size: .8em; color: #c2410c; font-weight: 700; }
section { margin-top: 9mm; }
section:first-of-type { break-before: page; margin-top: 0; }
h2 { break-after: avoid; font-size: 16pt; line-height: 1.25; margin: 0 0 2mm; padding-bottom: 2mm; border-bottom: 1px solid #e3e6ee; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 3mm; }
.lead { color: #4b5263; font-size: 11pt; break-after: avoid; }
ul { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.5mm; }
ol.steps { list-style: none; counter-reset: s; padding: 0; margin: 0 0 3mm; }
ol.steps li { counter-increment: s; position: relative; padding-left: 9mm; margin-bottom: 2mm; break-inside: avoid; }
ol.steps li::before { content: counter(s); position: absolute; left: 0; top: .1em; width: 6mm; height: 6mm; border-radius: 50%; background: linear-gradient(135deg, #f2b632, #e2483d); color: #fff; font-size: 8.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
table { width: 100%; border-collapse: collapse; margin: 1mm 0 4mm; font-size: 9.5pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { text-align: left; background: #f3f4f8; color: #4b5263; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; padding: 2mm 2.5mm; border: 1px solid #e3e6ee; }
td { padding: 2mm 2.5mm; border: 1px solid #e3e6ee; vertical-align: top; }
code { font-family: "JetBrains Mono", Menlo, Consolas, monospace; font-size: .86em; background: #f3f4f8; border: 1px solid #e3e6ee; border-radius: 3px; padding: 0 1.2mm; overflow-wrap: anywhere; }
strong { font-weight: 650; color: #111522; }
.box { padding: 2.5mm 3.5mm; border-radius: 2mm; margin: 0 0 3.5mm; break-inside: avoid; }
.box b { margin-right: 1.5mm; }
.tip { background: #ecf8f0; border-left: 3px solid #1f9d55; }
.tip b { color: #157a41; }
.warn { background: #fff6e0; border-left: 3px solid #d99a00; }
.warn b { color: #a26c00; }
.end { margin-top: 8mm; font-size: 9pt; color: #7a8193; text-align: center; }
@media screen { body { background: #eceef3; } main { background: #fff; padding: 12mm 15mm; margin: 8mm auto; box-shadow: 0 2px 12px rgba(0,0,0,.08); } }
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(GUIDE_META.title)} · ${esc(GUIDE_META.brand)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header class="cover">
  <div class="brand">${esc(GUIDE_META.brand)}</div>
  <h1>${esc(GUIDE_META.title)}</h1>
  <p class="sub">${esc(GUIDE_META.subtitle)}</p>
  <div class="meta">For the owner and staff · updated ${esc(GUIDE_META.updated)} · also in the app: Playbook → Guide</div>
</header>
<h3>Contents</h3>
<ul class="toc">${toc}</ul>
${sections}
<p class="end">${esc(GUIDE_META.brand)} — ${esc(GUIDE_META.title)}</p>
</main>
</body>
</html>
`;

async function main() {
  fs.mkdirSync(path.dirname(HTML_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(PDF_OUT), { recursive: true });
  fs.writeFileSync(HTML_OUT, html);
  console.log(`HTML  ${path.relative(ROOT, HTML_OUT)}  ${(html.length / 1024).toFixed(1)} KB`);

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + HTML_OUT, { waitUntil: 'load' });
    await page.pdf({
      path: PDF_OUT, format: 'A4', printBackground: true, preferCSSPageSize: true,
      margin: { top: '16mm', right: '15mm', bottom: '18mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#7a8193;padding:0 15mm;display:flex;justify-content:space-between">
        <span>${esc(GUIDE_META.brand)} · Product Directory guide</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
  } finally { await browser.close(); }
  const kb = fs.statSync(PDF_OUT).size / 1024;
  console.log(`PDF   ${path.relative(ROOT, PDF_OUT)}  ${kb.toFixed(1)} KB`);
  if (kb < 20) throw new Error('The PDF is suspiciously small (< 20 KB) — check the HTML.');
}

main().catch(e => { console.error(e); process.exit(1); });
