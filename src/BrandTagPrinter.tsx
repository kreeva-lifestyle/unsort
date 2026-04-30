/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';
import BrandTagModalNew from './components/ui/BrandTagModal';
import { friendlyError } from './lib/friendlyError';
import type { BrandTag, BrandTagInsert, AuditLogInsert } from './types/database';

const btAudit = (action: string, details: string) => {
  supabase.auth.getUser().then(({ data }) => {
    const entry: AuditLogInsert = { action, module: 'brand_tags', details, user_id: data.user?.id ?? null };
    supabase.from('audit_log').insert(entry);
  });
};

// ── Design Tokens ──────────────────────────────────────────────────────────────
import { T, S } from './lib/theme';

const btnPrimary: React.CSSProperties = S.btnPrimary;
const btnGhost: React.CSSProperties = S.btnGhost;
const btnSm: React.CSSProperties = { ...S.btnGhost, ...S.btnSm };
const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 6,
  color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box', transition: T.transition,
};
const thS: React.CSSProperties = {
  fontSize: 10, color: T.tx3, padding: '11px 14px', textAlign: 'left',
  fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)',
  whiteSpace: 'nowrap', fontFamily: T.sans, textTransform: 'uppercase', letterSpacing: '0.1em',
};
const tdS: React.CSSProperties = { padding: '11px 14px', fontSize: 13, borderBottom: `1px solid ${T.bd}`, color: T.tx2, fontFamily: T.sans };

// ── Types ──────────────────────────────────────────────────────────────────────
// UI view model: central BrandTag fields renamed for camelCase ergonomics
// (jio_code -> jioCode). Omit server-managed columns that the UI doesn't need.
interface BrandTagRow {
  id: string;
  brand: string;
  ean: string;
  sku: string;
  qty: string;
  mrp: number;
  size: string;
  product: string;
  color: string;
  mktd: string;
  jioCode: string;
  copies: number;
}

const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const sampleRow = (): BrandTagRow => ({
  id: uid(), brand: 'BRAND NAME: TANUKA', ean: '8905738880431', sku: 'TNDRS177-S',
  qty: 'INCLUDES: 1 U Top, 1 U Bottom, 1 U Dupatta', mrp: 6800, size: 'S',
  product: 'PRODUCT DESC: Co-ord Set', color: 'Pink',
  mktd: 'Arya Designs, 16, Amba Bhuvan, Nr. Kasanagar Circle, Opp. Kumar Gurukul Vidhyalaya Katargam, Surat-395004',
  jioCode: '702342013006', copies: 0,
});

const _DEFAULT_MKTD = 'Arya Designs, 16, Amba Bhuvan, Near Kasanagar Circle, Opp- Kumar Gurukul Vidhyalay Katargam, Surat-395004, Gujarat, India';
const blankRow = (): BrandTagRow => ({
  id: uid(), brand: '', ean: '', sku: '', qty: '', mrp: 0,
  size: '', product: '', color: '', mktd: _DEFAULT_MKTD, jioCode: '', copies: 0,
});

const REQUIRED_FIELDS: (keyof BrandTagRow)[] = ['brand', 'ean', 'sku', 'qty', 'size', 'product', 'color', 'mktd', 'jioCode'];
const validateRow = (r: BrandTagRow): string | null => {
  for (const f of REQUIRED_FIELDS) { if (!r[f] || String(r[f]).trim() === '') return f; }
  if (!r.mrp || r.mrp <= 0) return 'mrp';
  return null;
};

const fmtMrp = (v: number): string => '\u20B9' + v.toLocaleString('en-IN');

// ── Order Sheet Types & Mapping ──
const MARKETPLACE_BRAND: Record<string, string> = { 'ajio b2c': 'FUSIONIC', 'ajio tanuka': 'TANUKA', 'ajio svaraa': 'SVARAA' };
interface OrderRow { sku: string; marketplace: string; brand: string; copies: number; found: boolean; masterData?: BrandTagRow; }

const BRAND_PREFIX: Record<string, string> = { 'SVARAA': 'SW', 'TANUKA': 'TN' };

const parseOrderSheet = (data: any[], masterRows: BrandTagRow[]): OrderRow[] => {
  const map = new Map<string, OrderRow>();
  const masterMap = new Map<string, BrandTagRow>();
  masterRows.forEach(r => masterMap.set(r.sku.toUpperCase(), r));

  const findMaster = (sku: string, brand: string): BrandTagRow | undefined => {
    const upper = sku.toUpperCase();
    // 1. Exact match
    let m = masterMap.get(upper);
    if (m) return m;
    // 2. Try with brand prefix (SW for Svaraa, TN for Tanuka)
    const prefix = BRAND_PREFIX[brand];
    if (prefix) {
      m = masterMap.get(prefix + upper);
      if (m) return m;
    }
    // 3. Try stripping prefix if SKU already has it
    for (const [, px] of Object.entries(BRAND_PREFIX)) {
      if (upper.startsWith(px)) { m = masterMap.get(upper.slice(px.length)); if (m) return m; }
    }
    return undefined;
  };

  for (const row of data) {
    const mp = String(row['Marketplace'] || row['marketplace'] || '').trim();
    const rawSku = String(row['SKU'] || row['sku'] || '').trim();
    if (!mp || !rawSku) continue;
    const brand = MARKETPLACE_BRAND[mp.toLowerCase()] || 'UNKNOWN';

    const skuEntries = rawSku.split(',').map(s => s.trim()).filter(Boolean);
    for (const entry of skuEntries) {
      const [skuPart, copiesStr] = entry.split('*');
      const sku = skuPart.trim();
      if (!sku) continue;
      const copies = Math.max(1, parseInt(copiesStr) || 1);
      const key = sku.toUpperCase() + '::' + brand;

      if (map.has(key)) { map.get(key)!.copies += copies; }
      else {
        const master = findMaster(sku, brand);
      map.set(key, { sku: master?.sku || sku, marketplace: mp, brand, copies, found: !!master, masterData: master });
      }
    }
  }
  return Array.from(map.values());
};

// ── Build label print HTML (rendered inside an in-app iframe instead of a popup) ─
const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
const buildLabelsHtml = (labels: BrandTagRow[]): string => {
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
  .label{width:100%;height:100%;border:none}
}
@media screen{.label{border:1px solid #ccc;margin:8px auto}}
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head><body>${html}
<script>
document.querySelectorAll('.barcode svg').forEach(function(svg){
  var id=svg.id.replace('bc-','');
  var row=${JSON.stringify(labels.map(r=>({id:r.id,jio:r.jioCode,sku:r.sku})))}.find(function(r){return r.id===id});
  if(row&&row.jio)try{JsBarcode(svg,row.jio,{format:'CODE128',width:1.5,height:34,displayValue:true,text:row.sku,fontSize:8,font:'Arial',margin:0,textMargin:1})}catch(e){if(svg)svg.outerHTML='<div style="color:#c00;font-size:10px;border:1px dashed #c00;padding:4px;text-align:center">[Invalid barcode: '+(row.sku||row.jio||'?')+']</div>'}
});
<\/script></body></html>`;
};

const BRAND_OPTIONS = ['BRAND NAME: TANUKA', 'BRAND NAME: FUSIONIC', 'BRAND NAME: SVARAA'];
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Semi-Stitched'];
const PRODUCT_OPTIONS = ['PRODUCT DESC: Co-ord Set', 'PRODUCT DESC: Dress', 'PRODUCT DESC: Fusion Wear', 'PRODUCT DESC: Gown', 'PRODUCT DESC: Gown Set', 'PRODUCT DESC: Jumpsuit', 'PRODUCT DESC: Kurta', 'PRODUCT DESC: Kurta Set', 'PRODUCT DESC: Kurti', 'PRODUCT DESC: Lehenga Choli', 'PRODUCT DESC: Saree', 'PRODUCT DESC: Top'];


const COLOR_OPTIONS = ['Aqua', 'Beige', 'Black', 'Blue', 'Bronze', 'Brown', 'Burgundy', 'Coral', 'Cream', 'Fuchsia', 'Gold', 'Green', 'Grey', 'Lavender', 'Lime', 'Magenta', 'Maroon', 'Mauve', 'Multi', 'Mustard', 'Navy Blue', 'Nude', 'Off White', 'Olive', 'Orange', 'Peach', 'Pink', 'Pistachio', 'Purple', 'Rama', 'Red', 'Rose Gold', 'Rust', 'Sea Green', 'Silver', 'Tan', 'Taupe', 'Teal', 'Turquoise', 'Violet', 'White', 'Wine', 'Yellow'];

const QTY_OPTIONS = [
  'INCLUDES: 1 U Top, 1 U Bottom, 1 U Dupatta', 'INCLUDES: 1 U Lehenga, 1 U Blouse, 1 U Dupatta',
  'INCLUDES: 1 U Top, 1 U Bottom', 'INCLUDES: 1 U Gown, 1 U Dupatta', 'INCLUDES: 1 U Blouse, 1 U Saree',
  'INCLUDES: 1 U Gown', 'INCLUDES: 1 U Top', 'INCLUDES: 1 U Top, 1 U Pant',
  'INCLUDES: 1 U Bottom, 1 U Kurta, 1 U Dupatta', 'INCLUDES: 1 U Blouse, 1 U Jacket, 1 U Sharara',
  'INCLUDES: 1 U Top, 1 U Koti, 1 U Bottom', 'INCLUDES: 1 U Top, 1 U Sharara, 1 U Dupatta',
  'INCLUDES: 1 U Blouse, 1 U Saree, 1 U Belt', 'INCLUDES: 1 U Pant, 1 U Kurta, 1 U Dupatta',
  'INCLUDES: 1 U Top, 1 U Pant, 1 U Dupatta, 1 U Belt', 'INCLUDES: 1 U Dress, 1 U Belt, 1 U Dupatta',
  'INCLUDES: 1 U Top, 1 U Palazzo', 'INCLUDES: 1 U Top, 1 U Tube, 1 U Bottom',
  'INCLUDES: 1 U Gown, 1 U Sleeves', 'INCLUDES: 1 U Top, 1 U Pant, 1 U Jacket',
  'INCLUDES: 1 U Jumpsuit', 'INCLUDES: 1 U Shirt, 1 U Trouser', 'INCLUDES: 1 U Top, 1 U Pant, 1 U Dupatta',
  'INCLUDES: 1 U Top, 1 U Bottom, 1 U Sleeve', 'INCLUDES: 1 U Top, 1 U Dupatta',
  'INCLUDES: 1 U Kurti, 1 U Jacket', 'INCLUDES: 1 U Gown, 1 U Bottom',
  'INCLUDES: 1 U Blouse, 1 U Shrug, 1 U Pant', 'INCLUDES: 1 U Blouse, 1 U Palazzo, 1 U Jacket',
  'INCLUDES: 1 U Dress', 'INCLUDES: 1 U One Piece', 'INCLUDES: 1 U Palazzo, 1 U Top',
  'INCLUDES: 1 U Pant, 1 U Kurta', 'INCLUDES: 1 U Top, 1 U Jumpsuit',
  'INCLUDES: 1 U Gown, 1 U Dupatta, 1 U Pant', 'INCLUDES: 1 U Blouse, 1 U Bottom',
  'INCLUDES: 1 U Dress, 1 U Bottom, 1 U Dupatta', 'INCLUDES: 1 U Kurta',
  'INCLUDES: 1 U Kurta, 1 U Bottom, 1 U Dupatta', 'INCLUDES: 1 U Palazzo, 1 U Blouse, 1 U Koti',
  'INCLUDES: 1 U Lehenga, 1 U Blouse', 'INCLUDES: 1 U Lehenga, 1 U Blouse, 1 U Dupatta, 1 U Jacket',
  'INCLUDES: 1 U Saree, 1 U Blouse, 1 U Dupatta', 'INCLUDES: 1 U Kurta, 1 U Sharara, 1 U Dupatta',
  'INCLUDES: 1 U Lehenga, 1 U Choli, 1 U Jacket', 'INCLUDES: 1 U Lehenga, 1 U Blouse, 2 U Dupatta',
];

// Add/Edit modal moved to src/components/ui/BrandTagModal.tsx

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BrandTagPrinter() {
  const { addToast } = useNotifications();
  // Server-side pagination + filtering
  const [rows, setRows] = useState<BrandTagRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // refreshMsg removed — refresh moved inline
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  // Print-preview iframe (in-app, replaces popup window per audit P0)
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printCount, setPrintCount] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);
  const openLabelPrint = useCallback((labels: BrandTagRow[]) => {
    if (labels.length === 0) return;
    setPrintCount(labels.length);
    setPrintHtml(buildLabelsHtml(labels));
  }, []);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [modalRow, setModalRow] = useState<BrandTagRow | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const fileRef = useRef<HTMLInputElement>(null);
  const orderFileRef = useRef<HTMLInputElement>(null);
  const [orderRows, setOrderRows] = useState<OrderRow[] | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderLoadMsg, setOrderLoadMsg] = useState('');
  const [orderPage, setOrderPage] = useState(0);
  const [orderPerPage, setOrderPerPage] = useState(25);
  const [btPage, setBtPage] = useState(0);
  const [btPerPage, setBtPerPage] = useState(25);

  // Fetch current page from Supabase (server-side pagination)
  const fetchPage = useCallback(async () => {
    let query = supabase.from('brand_tags').select('id, brand, ean, sku, qty, mrp, size, product, color, mktd, jio_code, copies', { count: 'estimated' });
    if (search) query = query.ilike('search_text', `%${search.toLowerCase().replace(/[%_]/g, '\\$&')}%`);
    if (brandFilter) query = query.ilike('brand', `%: ${brandFilter.replace(/[%_]/g, '\\$&')}`);
    if (sizeFilter) query = query.eq('size', sizeFilter);
    const from = btPage * btPerPage;
    const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + btPerPage - 1);
    type BrandTagFetchRow = Pick<BrandTag, 'id' | 'brand' | 'ean' | 'sku' | 'qty' | 'mrp' | 'size' | 'product' | 'color' | 'mktd' | 'jio_code' | 'copies'>;
    if (data) setRows((data as BrandTagFetchRow[]).map((d): BrandTagRow => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies })));
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [btPage, btPerPage, search, brandFilter, sizeFilter]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  // Lock body scroll when any modal/popup is open
  useEffect(() => {
    const hasModal = !!modalRow || !!orderRows;
    document.body.classList.toggle('modal-open', hasModal);
    return () => { document.body.classList.remove('modal-open'); };
  }, [modalRow, orderRows]);

  // Smart realtime: apply individual row changes without re-fetching entire page
  useEffect(() => {
    const mapRow = (d: BrandTag): BrandTagRow => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies });
    const ch = supabase.channel('bt-smart')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'brand_tags' }, (payload) => {
        const updated = mapRow(payload.new as BrandTag);
        setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'brand_tags' }, (payload) => {
        const id = (payload.old as Partial<BrandTag> | null)?.id;
        if (id) { setRows(prev => prev.filter(r => r.id !== id)); setTotalCount(c => c - 1); }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brand_tags' }, () => {
        // For inserts, just bump the count - user sees it when they paginate/refresh
        setTotalCount(c => c + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Debounce search to avoid hammering DB on every keystroke
  const searchTimeout = useRef<any>(null);
  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setBtPage(0), 300);
  };

  // Reset page on filter change
  useEffect(() => { setBtPage(0); }, [brandFilter, sizeFilter]);

  // Filter options are now preset constants (BRAND_OPTIONS, SIZE_OPTIONS, COLOR_OPTIONS)
  // Filtering happens server-side in fetchPage()
  const totalPages = Math.ceil(totalCount / btPerPage);

  // ── Import Excel (addToast in deps for fresh closure) ──
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);
        const imported: BrandTagRow[] = json.map(d => {
          // Auto-map brand from Marketplace column if BRAND NAME is missing
          let brand = String(d['BRAND NAME'] ?? '');
          if (!brand) {
            const mp = String(d['Marketplace'] || d['marketplace'] || '').trim().toLowerCase();
            if (mp) brand = 'BRAND NAME: ' + (MARKETPLACE_BRAND[mp] || mp.toUpperCase());
          }
          return {
          id: uid(),
          brand,
          ean: String(d['EAN'] ?? ''),
          sku: String(d['SKU'] ?? '').split('*')[0].trim(), // strip *copies if present
          qty: String(d['QTY'] ?? ''),
          mrp: Number(d['MRP']) || 0,
          size: String(d['SIZE'] ?? ''),
          product: String(d['PRODUCT'] ?? ''),
          color: String(d['Color'] ?? ''),
          mktd: String(d['MKTD & DIST. BY'] ?? '') || _DEFAULT_MKTD,
          jioCode: String(d['Jio Code'] ?? ''),
          copies: Number(d['COPIES']) || 0,
        }});
        if (imported.length === 0) {
          addToast('No rows found. Check that column headers match the expected format.', 'error');
          return;
        }
        // Validate all rows - reject file if any row has missing data
        const errors: string[] = [];
        imported.forEach((r, i) => {
          const bad = validateRow(r);
          if (bad) errors.push(`Row ${i + 1} (SKU: ${r.sku || 'empty'}): missing "${bad}"`);
        });
        if (errors.length > 0) {
          // Actionable error report — user can fix in Excel and re-import (audit P2)
          const errorRows = imported.map((r, i) => {
            const bad = validateRow(r);
            return bad ? { Row: i + 2, SKU: r.sku || '(empty)', MissingField: bad, EAN: r.ean, Size: r.size, Brand: r.brand } : null;
          }).filter(Boolean);
          const ws = XLSX.utils.json_to_sheet(errorRows as any[]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
          XLSX.writeFile(wb, `brand_tags_import_errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
          addToast(`Import rejected — ${errors.length} row(s) missing data. Error report downloaded.`, 'error');
          return;
        }
        // Smart import with queue persistence
        const toUpsert: BrandTagInsert[] = imported.map(r => ({
          brand: r.brand, ean: r.ean, sku: r.sku, qty: r.qty, mrp: r.mrp,
          size: r.size, product: r.product, color: r.color, mktd: r.mktd,
          jio_code: r.jioCode, copies: r.copies,
          updated_at: new Date().toISOString(),
        }));

        // Warn on refresh during import
        const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); return ''; };
        window.addEventListener('beforeunload', beforeUnload);
        setImporting(true);

        const batchSize = 500;
        let failed = 0;
        for (let i = 0; i < toUpsert.length; i += batchSize) {
          const batch = toUpsert.slice(i, i + batchSize);
          const { error } = await supabase.from('brand_tags')
            .upsert(batch, { onConflict: 'ean,sku,size', ignoreDuplicates: false });
          if (error) failed += batch.length;
          const done = Math.min(i + batchSize, toUpsert.length);
          setImportProgress(`${done} / ${toUpsert.length}`);
        }

        window.removeEventListener('beforeunload', beforeUnload);
        setImporting(false);
        setImportProgress('');
        btAudit('import', `Imported ${toUpsert.length} rows${failed > 0 ? `, ${failed} failed` : ''}`);
        addToast(`Import complete! ${toUpsert.length} rows processed.${failed > 0 ? ` ${failed} failed.` : ''}`, failed > 0 ? 'error' : 'success');
        fetchPage();
      } catch (e: any) {
        const errMsg = e?.message || '';
        if (errMsg.toLowerCase().includes('column') || errMsg.toLowerCase().includes('header')) {
          addToast('Invalid columns. Expected headers: SKU, JIO, Brand, Size. Check your template.', 'error');
        } else if (errMsg.toLowerCase().includes('zip') || errMsg.toLowerCase().includes('format')) {
          addToast('File format unsupported. Use .xlsx, .xls, or .csv (not encrypted).', 'error');
        } else {
          addToast('Failed to parse Excel: ' + (errMsg || 'unknown error'), 'error');
        }
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [addToast]);

  // ── Export Excel ──
  const handleExport = useCallback(() => {
    const data = rows.map(r => ({
      'BRAND NAME': r.brand,
      'EAN': r.ean,
      'SKU': r.sku,
      'QTY': r.qty,
      'MRP': r.mrp,
      'SIZE': r.size,
      'PRODUCT': r.product,
      'Color': r.color,
      'MKTD & DIST. BY': r.mktd,
      'Jio Code': r.jioCode,
      'COPIES': r.copies,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Brand Tags');
    XLSX.writeFile(wb, 'brand_tags_export.xlsx');
  }, [rows]);

  // ── Row Mutations ──

  // Delete SKU — confirms via in-app modal instead of window.confirm (audit P0)
  const [confirmDel, setConfirmDel] = useState<{ id: string; sku: string } | null>(null);
  const deleteRow = useCallback((id: string, sku: string) => {
    setConfirmDel({ id, sku });
  }, []);
  const actuallyDelete = useCallback(async () => {
    if (!confirmDel) return;
    const { id, sku } = confirmDel;
    setConfirmDel(null);
    const { error } = await supabase.from('brand_tags').delete().eq('id', id);
    if (error) { addToast(`Delete failed — ${friendlyError(error)}`, 'error'); return; }
    btAudit('delete', `Deleted SKU: ${sku}`);
    addToast(`Deleted ${sku}`, 'success');
    fetchPage();
  }, [confirmDel, addToast, fetchPage]);

  // ── Modal Open/Save ──
  const openAdd = useCallback(() => {
    setModalMode('add');
    setModalRow(blankRow());
  }, []);

  const openEdit = useCallback((row: BrandTagRow) => {
    setModalMode('edit');
    setModalRow({ ...row });
  }, []);

  const handleModalSave = useCallback((updated: BrandTagRow) => {
    const dbRow: BrandTagInsert = { brand: updated.brand, ean: updated.ean, sku: updated.sku, qty: updated.qty, mrp: updated.mrp, size: updated.size, product: updated.product, color: updated.color, mktd: updated.mktd, jio_code: updated.jioCode, copies: updated.copies };
    if (modalMode === 'add') {
      supabase.from('brand_tags').insert(dbRow).then(({ error }) => { if (error) addToast('Save failed — ' + friendlyError(error), 'error'); else { btAudit('add', `Added SKU: ${updated.sku}`); addToast(`SKU ${updated.sku} added`, 'success'); fetchPage(); } });
    } else {
      supabase.from('brand_tags').update({ ...dbRow, updated_at: new Date().toISOString() }).eq('id', updated.id).then(({ error }) => { if (error) addToast('Update failed — ' + friendlyError(error), 'error'); else { btAudit('edit', `Edited SKU: ${updated.sku}`); addToast(`SKU ${updated.sku} updated`, 'success'); fetchPage(); } });
    }
    setModalRow(null);
  }, [modalMode, fetchPage]);

  // ── Print Handlers ──
  const printSingle = useCallback((row: BrandTagRow) => {
    const bad = validateRow(row);
    if (bad) { addToast(`Cannot print — "${bad}" is missing for SKU: ${row.sku || 'empty'}`, 'error'); return; }
    openLabelPrint([row]);
  }, [addToast]);

  // ── Order Sheet Import ──
  const handleOrderImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setOrderLoading(true);
        setOrderLoadMsg('Parsing file...');
        const d = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(d, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);
        setOrderLoadMsg(`${json.length} rows parsed. Loading master data...`);
        const allMaster: BrandTag[] = [];
        let from = 0; let more = true;
        while (more) {
          const { data } = await supabase.from('brand_tags').select('*').range(from, from + 999);
          if (data && data.length > 0) { allMaster.push(...(data as BrandTag[])); from += 1000; }
          if (!data || data.length < 1000) more = false;
          setOrderLoadMsg(`${json.length} rows parsed. Master data: ${allMaster.length} loaded...`);
        }
        setOrderLoadMsg(`Matching ${json.length} orders against ${allMaster.length} SKUs...`);
        const masterRows: BrandTagRow[] = allMaster.map((d): BrandTagRow => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies }));
        const parsed = parseOrderSheet(json, masterRows);
        setOrderRows(parsed); setOrderPage(0);
        setOrderLoading(false); setOrderLoadMsg('');
      } catch (e: any) { addToast('Failed to parse order sheet — ' + (e?.message || 'check column format'), 'error'); setOrderLoading(false); setOrderLoadMsg(''); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [addToast]);

  const updateOrderCopies = (sku: string, brand: string, copies: number) => {
    setOrderRows(prev => prev ? prev.map(r => (r.sku === sku && r.brand === brand) ? { ...r, copies: Math.max(0, copies) } : r) : null);
  };

  const printOrderLabels = (items: OrderRow[]) => {
    const labels: BrandTagRow[] = [];
    items.forEach(r => {
      if (!r.found || !r.masterData || r.copies <= 0) return;
      for (let i = 0; i < r.copies; i++) labels.push({ ...r.masterData, brand: `BRAND NAME: ${r.brand}`, copies: 1 });
    });
    if (labels.length === 0) { addToast('No printable labels. Ensure SKUs exist in master data and copies > 0.', 'error'); return; }
    openLabelPrint(labels);
  };

  const printTestLabel = useCallback(() => {
    openLabelPrint([rows[0] || sampleRow()]);
  }, [rows]);


  // ── Select All / Set All Copies ──

  // Server-side pagination handles btPage/btPerPage - defined above

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      {loading && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${T.bd2}`, borderTopColor: T.ac, borderRadius: '50%', animation: 'btnSpin .7s linear infinite' }} />
        <span style={{ fontSize: 11, color: T.tx3 }}>Loading brand tags...</span>
      </div>}
      {!loading && <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Brand Tags</div>
          <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>{totalCount} master tags · 1.97 × 2.97 in label · CODE128 barcode</div>
          {importing && <span style={{ fontSize: 10, color: T.yl, marginTop: 4, fontWeight: 600, display: 'block' }}>Importing {importProgress}...</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {orderLoading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.yl }}><span style={{ width: 10, height: 10, border: '1.5px solid rgba(251,191,36,.2)', borderTopColor: T.yl, borderRadius: '50%', animation: 'btnSpin .6s linear infinite', flexShrink: 0 }} />{orderLoadMsg}</span>}
          <input ref={orderFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleOrderImport} />
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} />
          <div style={{ position: 'relative' }}>
            <button style={S.btnGhost} onClick={() => setMoreMenuOpen(o => !o)}>
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Import / Export
            </button>
            {moreMenuOpen && (
              <>
                <div onClick={() => setMoreMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 51, background: 'rgba(14,18,30,0.98)', border: `1px solid ${T.bd2}`, borderRadius: 8, boxShadow: '0 10px 32px rgba(0,0,0,.55)', minWidth: 180, padding: 4 }}>
                  {[
                    { label: 'Import order sheet', action: () => orderFileRef.current?.click() },
                    { label: 'Import from Excel', action: () => fileRef.current?.click() },
                    { label: 'Export to Excel', action: handleExport },
                    { label: 'Test print', action: printTestLabel },
                  ].map((opt, i) => (
                    <div key={i} onClick={() => { setMoreMenuOpen(false); opt.action(); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: T.tx2, borderRadius: 5, transition: 'all .12s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.08)'; e.currentTarget.style.color = T.tx; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.tx2; }}>{opt.label}</div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button style={S.btnGhost} onClick={openAdd}>+ Add tag</button>
          <button style={{ ...S.btnPrimary, background: `linear-gradient(135deg, ${T.gr}, ${T.gr}cc)`, boxShadow: `0 2px 10px rgba(34,197,94,.3)` }} onClick={() => { const toPrint: BrandTagRow[] = []; rows.forEach(r => { for (let i = 0; i < (r.copies || 0); i++) toPrint.push(r); }); if (toPrint.length > 0) openLabelPrint(toPrint); else addToast('Set copies > 0 on rows to print', 'error'); }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
            Print
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="Search SKU, product, EAN..." value={search} onChange={e => handleSearch(e.target.value)} style={{ ...S.fSearch, background: 'transparent', border: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setBrandFilter('')} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${!brandFilter ? T.ac : T.bd}`, cursor: 'pointer', fontSize: 11, fontWeight: 500, background: !brandFilter ? 'rgba(99,102,241,.08)' : 'transparent', color: !brandFilter ? T.ac2 : T.tx2, fontFamily: T.sans, transition: T.transition }}>All brands</button>
          {BRAND_OPTIONS.map(b => { const n = b.replace(/^BRAND NAME:\s*/i, ''); return (
            <button key={b} onClick={() => setBrandFilter(brandFilter === n ? '' : n)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${brandFilter === n ? T.ac : T.bd}`, cursor: 'pointer', fontSize: 11, fontWeight: 500, background: brandFilter === n ? 'rgba(99,102,241,.08)' : 'transparent', color: brandFilter === n ? T.ac2 : T.tx2, fontFamily: T.sans, transition: T.transition }}>{n}</button>
          ); })}
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '6px 10px', outline: 'none', cursor: 'pointer' }}><option value="">All sizes</option>{SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8, background: 'rgba(255,255,255,0.015)', marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            {['Brand', 'SKU · Product', 'Size', 'Color', 'MRP', 'Jio Code', 'Copies', 'Actions'].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length === 0 && !loading && <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 10 }}>No rows. Import Excel or add SKUs.</td></tr>}
            {rows.map(row => (
              <tr key={row.id} style={{ transition: 'background .1s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(99,102,241,.10)', color: T.ac2 }}>{row.brand.replace(/^BRAND NAME:\s*/i, '')}</span></td>
                <td style={tdS}><div style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3 }}>{row.sku}</div><div style={{ fontWeight: 500, color: T.tx, marginTop: 1 }}>{row.product.replace(/^PRODUCT DESC:\s*/i, '')}</div></td>
                <td style={tdS}>{row.size}</td>
                <td style={tdS}>{row.color}</td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtMrp(row.mrp)}</td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 11, color: T.tx3 }}>{row.jioCode}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <button onClick={() => { const old = row.copies || 0; const v = Math.max(0, old - 1); setRows(prev => prev.map(r => r.id === row.id ? { ...r, copies: v } : r)); supabase.from('brand_tags').update({ copies: v }).eq('id', row.id).then(({ error }) => { if (error) { setRows(prev => prev.map(r => r.id === row.id ? { ...r, copies: old } : r)); addToast(friendlyError(error), 'error'); } }); }} style={{ width: 28, height: 28, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer', borderRadius: '6px 0 0 6px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${T.bd}`, borderBottom: `1px solid ${T.bd}`, fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: row.copies > 0 ? T.ac2 : T.tx3, background: row.copies > 0 ? 'rgba(99,102,241,.06)' : 'transparent' }}>{row.copies || 0}</span>
                    <button onClick={() => { const old = row.copies || 0; const v = old + 1; setRows(prev => prev.map(r => r.id === row.id ? { ...r, copies: v } : r)); supabase.from('brand_tags').update({ copies: v }).eq('id', row.id).then(({ error }) => { if (error) { setRows(prev => prev.map(r => r.id === row.id ? { ...r, copies: old } : r)); addToast(friendlyError(error), 'error'); } }); }} style={{ width: 28, height: 28, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer', borderRadius: '0 6px 6px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button style={btnSm} onClick={() => openEdit(row)}>Edit</button>
                    <button style={{ ...btnSm, color: T.bl }} onClick={() => printSingle(row)}>Print</button>
                    <button style={{ ...btnSm, color: T.re }} onClick={() => deleteRow(row.id, row.sku)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 11 }}>
        <select value={btPerPage} onChange={e => { setBtPerPage(Number(e.target.value)); setBtPage(0); }} style={{ ...inp, width: 'auto', padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
        <span style={{ color: T.tx3 }}>rows</span>
        {totalPages > 1 && <>
          <span onClick={() => setBtPage(Math.max(0, btPage - 1))} style={{ ...btnSm, opacity: btPage === 0 ? 0.3 : 1, pointerEvents: btPage === 0 ? 'none' : 'auto' }}>Prev</span>
          <span style={{ color: T.tx3 }}>{btPage + 1} / {totalPages}</span>
          <span onClick={() => setBtPage(Math.min(totalPages - 1, btPage + 1))} style={{ ...btnSm, opacity: btPage >= totalPages - 1 ? 0.3 : 1, pointerEvents: btPage >= totalPages - 1 ? 'none' : 'auto' }}>Next</span>
        </>}
      </div>

      {/* ── Order Sheet Preview ── */}
      {orderRows && (() => {
        const ready = orderRows.filter(r => r.found);
        const missing = orderRows.filter(r => !r.found);
        const totalCopies = ready.reduce((s, r) => s + r.copies, 0);
        const opp = orderPerPage;
        const otp = Math.ceil(orderRows.length / opp);
        const opaged = orderRows.slice(orderPage * opp, (orderPage + 1) * opp);
        return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.80)', zIndex: 200, backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <div style={{ background: 'rgba(14,18,30,0.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: '95vw', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backdropFilter: 'blur(32px)' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Order Sheet Preview</span>
                <span style={{ fontSize: 10, color: T.tx3, marginLeft: 8 }}>{ready.length} ready</span>
                <span style={{ fontSize: 10, color: T.gr, marginLeft: 5 }}>{totalCopies} labels</span>
                {missing.length > 0 && <span style={{ fontSize: 10, color: T.re, marginLeft: 5 }}>{missing.length} missing</span>}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {missing.length === 0
                  ? <button style={{ ...btnPrimary, background: `linear-gradient(135deg,${T.gr}cc,${T.gr}88)` }} onClick={() => printOrderLabels(ready)}>Print All ({totalCopies})</button>
                  : <button style={{ ...btnPrimary, background: `linear-gradient(135deg,${T.gr}cc,${T.gr}88)` }} onClick={() => { if (confirm(`Print the ${ready.length} ready label${ready.length === 1 ? '' : 's'} (${totalCopies} copies)? ${missing.length} missing SKU${missing.length === 1 ? '' : 's'} will be skipped — resolve ${missing.length === 1 ? 'it' : 'them'} later and re-run.`)) printOrderLabels(ready); }}>Print Ready ({totalCopies}) · Skip {missing.length}</button>
                }
                <button style={btnGhost} onClick={() => {
                  const exportData = (orderRows || []).map(r => ({
                    'Marketplace': r.marketplace, 'SKU': r.sku, 'Brand': r.brand,
                    'Product': r.found ? r.masterData?.product.replace(/^PRODUCT DESC:\s*/i, '') : '', 'Color': r.found ? r.masterData?.color : '',
                    'Size': r.found ? r.masterData?.size : '', 'MRP': r.found ? r.masterData?.mrp : '',
                    'Copies': r.copies, 'Status': r.found ? 'Ready' : 'Missing',
                  }));
                  const ws = XLSX.utils.json_to_sheet(exportData);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Order Preview');
                  XLSX.writeFile(wb, 'order-preview.xlsx');
                }}>Export</button>
                <span onClick={() => setOrderRows(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span>
              </div>
            </div>
            {missing.length > 0 && <div style={{ padding: '8px 14px', background: 'rgba(248,113,113,.05)', borderBottom: `1px solid rgba(248,113,113,.12)`, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: T.re, lineHeight: 1.5 }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>⚠</span>
              <div><strong>{missing.length} SKU{missing.length > 1 ? 's' : ''} not found in master data.</strong> Printing is blocked until all SKUs are resolved. Go to the Brand Tags table, add the missing SKU{missing.length > 1 ? 's' : ''} ({missing.map(m => m.sku).join(', ')}), then re-import this order sheet.</div>
            </div>}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>
                  {['#', 'Marketplace', 'SKU', 'Brand', 'Product', 'Color', 'Size', 'MRP', 'Copies', 'Status'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>{opaged.map((r, i) => (
                  <tr key={r.sku} style={{ transition: 'background .1s', background: !r.found ? 'rgba(248,113,113,.04)' : 'transparent' }} onMouseEnter={e => { e.currentTarget.style.background = T.s2; }} onMouseLeave={e => { e.currentTarget.style.background = !r.found ? 'rgba(248,113,113,.04)' : 'transparent'; }}>
                    <td style={{ ...tdS, color: T.tx3 }}>{orderPage * opp + i + 1}</td>
                    <td style={tdS}>{r.marketplace}</td>
                    <td style={{ ...tdS, fontWeight: 500 }}>{r.sku}</td>
                    <td style={tdS}>{r.brand}</td>
                    <td style={tdS}>{r.found ? r.masterData?.product.replace(/^PRODUCT DESC:\s*/i, '') : '—'}</td>
                    <td style={tdS}>{r.found ? r.masterData?.color : '—'}</td>
                    <td style={tdS}>{r.found ? r.masterData?.size : '—'}</td>
                    <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{r.found ? fmtMrp(r.masterData?.mrp || 0) : '—'}</td>
                    <td style={tdS}><input type="number" min={0} value={r.copies} onChange={e => updateOrderCopies(r.sku, r.brand, Number(e.target.value))} style={{ ...inp, width: 40, textAlign: 'center', padding: '2px', fontSize: 12 }} /></td>
                    <td style={tdS}>{r.found ? <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'rgba(52,211,153,.12)', color: T.gr }}>Ready</span> : <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'rgba(248,113,113,.12)', color: T.re }}>Missing</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${T.bd}`, fontSize: 11 }}>
              <select value={orderPerPage} onChange={e => { setOrderPerPage(Number(e.target.value)); setOrderPage(0); }} style={{ ...inp, width: 'auto', padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}><option value={25}>25</option><option value={50}>50</option><option value={75}>75</option><option value={100}>100</option></select>
              <span style={{ color: T.tx3 }}>rows</span>
              {otp > 1 && <>
                <span onClick={() => setOrderPage(Math.max(0, orderPage - 1))} style={{ ...btnSm, opacity: orderPage === 0 ? 0.3 : 1 }}>Prev</span>
                <span style={{ color: T.tx3 }}>{orderPage + 1} / {otp}</span>
                <span onClick={() => setOrderPage(Math.min(otp - 1, orderPage + 1))} style={{ ...btnSm, opacity: orderPage >= otp - 1 ? 0.3 : 1 }}>Next</span>
              </>}
            </div>
          </div>
        </div>;
      })()}

      {/* ── Delete confirm modal (replaces window.confirm per audit P0) ── */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center' as const, maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Delete this SKU?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14, fontFamily: T.mono }}>{confirmDel.sku || '(empty SKU)'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDel(null)} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button onClick={actuallyDelete} style={{ ...S.btnDanger, flex: 1, justifyContent: 'center', background: `linear-gradient(135deg, ${T.re}, ${T.re}cc)`, color: '#fff', border: 'none' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {modalRow && (
        <BrandTagModalNew
          mode={modalMode as 'add' | 'edit'}
          initial={modalRow}
          onSave={handleModalSave}
          onClose={() => setModalRow(null)}
          brandOptions={BRAND_OPTIONS}
          productOptions={PRODUCT_OPTIONS}
          sizeOptions={SIZE_OPTIONS}
          colorOptions={COLOR_OPTIONS}
          qtyOptions={QTY_OPTIONS}
          validateRow={validateRow}
        />
      )}

      {/* ── Label Print Preview (iframe-based; no popup required) ── */}
      {printHtml && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPrintHtml(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(540px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', fontFamily: T.sora }}>Label Print Preview</div>
                <div style={{ fontSize: 11, color: '#6B7890' }}>{printCount} label{printCount === 1 ? '' : 's'} ready to print</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { printIframeRef.current?.contentWindow?.print(); }} style={S.btnPrimary}>Print</button>
                <button onClick={() => setPrintHtml(null)} style={S.btnGhost}>Close</button>
              </div>
            </div>
            <iframe
              ref={printIframeRef}
              title="Label print preview"
              srcDoc={printHtml}
              style={{ flex: 1, width: '100%', minHeight: 420, border: 'none', background: '#fff' }}
            />
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
