/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ulphprdnswznfztawbvg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0');
const btAudit = (action: string, details: string) => { supabase.auth.getUser().then(({ data }) => { supabase.from('audit_log').insert({ action, module: 'brand_tags', details, user_id: data.user?.id }); }); };

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: '#060810', s: '#0B0F19', s2: '#0F1420', s3: '#141B2B',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', bl: '#38BDF8', yl: '#F59E0B',
  r: 8,
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
  glass1: 'rgba(255,255,255,0.02)', glass2: 'rgba(255,255,255,0.04)',
  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
};

// ── Reusable style helpers ─────────────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  display: 'inline-flex', alignItems: 'center', gap: 5,
  whiteSpace: 'nowrap', letterSpacing: '0.02em',
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', boxShadow: '0 2px 10px rgba(99,102,241,0.25)' };
const btnGhost: React.CSSProperties = { ...btnBase, fontWeight: 500, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd2}`, color: T.tx2 };

const btnSm: React.CSSProperties = { padding: '3px 8px', fontSize: 10, borderRadius: 4, border: `1px solid ${T.bd2}`, cursor: 'pointer', fontFamily: T.sans, fontWeight: 500, color: T.tx2, background: 'rgba(255,255,255,0.03)', whiteSpace: 'nowrap' };
const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 6,
  color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box', transition: T.transition,
};
const thS: React.CSSProperties = {
  fontSize: 9, color: T.tx3, padding: '9px 12px', textAlign: 'left',
  fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)',
  whiteSpace: 'nowrap', fontFamily: T.sans, textTransform: 'uppercase', letterSpacing: '0.1em',
};
const tdS: React.CSSProperties = { padding: '9px 12px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, color: T.tx2, fontFamily: T.sans };
const fLabel: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: T.sans };

// ── Types ──────────────────────────────────────────────────────────────────────
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
  id: uid(),
  brand: 'BRAND NAME: TANUKA',
  ean: '8905738880431',
  sku: 'TNDRS177-S',
  qty: 'INCLUDES: 1 U Top, 1 U Bottom, 1 U Dupatta',
  mrp: 6800,
  size: 'S',
  product: 'PRODUCT DESC: Co-ord Set',
  color: 'Pink',
  mktd: 'Arya Designs, 16, Amba Bhuvan, Nr. Kasanagar Circle, Opp. Kumar Gurukul Vidhyalaya Katargam, Surat-395004',
  jioCode: '702342013006',
  copies: 0,
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

// ── Print function: renders labels into a new window for clean printing ───────
const printLabelsInWindow = (labels: BrandTagRow[]) => {
  const win = window.open('', '_blank', 'width=300,height=500');
  if (!win) { alert('Popup blocked. Allow popups for this site.'); return; }

  const html = labels.map(r => {
    const brand = r.brand.replace(/^BRAND NAME:\s*/i, '').trim().toUpperCase();
    const product = r.product.replace(/^PRODUCT DESC:\s*/i, '').trim();
    const qty = r.qty.replace(/^INCLUDES:\s*/i, '').trim();
    const mrp = '\u20B9' + r.mrp.toLocaleString('en-IN');
    return `<div class="label">
  <div class="main">
    <div class="row b">BRAND NAME: ${brand}</div>
    <div class="row b">SKU: ${r.sku}</div>
    <div class="row">PRODUCT DESC: ${product}</div>
    <div class="row">${qty}</div>
    <div class="row">SIZE: ${r.size}</div>
    <div class="row">COLOR: ${r.color}</div>
    <div class="row b">MRP: ${mrp}</div>
    <div class="row sm">MKTD &amp; DIST. BY: ${r.mktd}</div>
    <div class="row">JIO CODE: ${r.jioCode}</div>
    <div class="barcode"><svg id="bc-${r.id}"></svg></div>
  </div>
  <div class="ean"><span>EAN: ${r.sku}</span></div>
</div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head>
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
  if(row&&row.jio)try{JsBarcode(svg,row.jio,{format:'CODE128',width:1.5,height:34,displayValue:true,text:row.sku,fontSize:8,font:'Arial',margin:0,textMargin:1})}catch(e){}
});
setTimeout(function(){window.print()},600);
<\/script></body></html>`);
  win.document.close();
};

const DEFAULT_MKTD = 'Arya Designs, 16, Amba Bhuvan, Near Kasanagar Circle, Opp- Kumar Gurukul Vidhyalay Katargam, Surat-395004, Gujarat, India';
const BRAND_OPTIONS = ['BRAND NAME: TANUKA', 'BRAND NAME: FUSIONIC', 'BRAND NAME: SVARAA'];
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];
const PRODUCT_OPTIONS = ['PRODUCT DESC: Co-ord Set', 'PRODUCT DESC: Dress', 'PRODUCT DESC: Fusion Wear', 'PRODUCT DESC: Gown', 'PRODUCT DESC: Gown Set', 'PRODUCT DESC: Jumpsuit', 'PRODUCT DESC: Kurta', 'PRODUCT DESC: Kurta Set', 'PRODUCT DESC: Kurti', 'PRODUCT DESC: Lehenga Choli', 'PRODUCT DESC: Saree', 'PRODUCT DESC: Top'];

// Searchable auto-suggest input
const SearchableSelect = ({ value, options, placeholder, stripPrefix, onChange }: { value: string; options: string[]; placeholder: string; stripPrefix?: RegExp; onChange: (v: string) => void }) => {
  const [text, setText] = useState(value ? (stripPrefix ? value.replace(stripPrefix, '') : value) : '');
  const [open, setOpen] = useState(false);
  const display = (o: string) => stripPrefix ? o.replace(stripPrefix, '') : o;
  const q = text.toLowerCase();
  const filtered = options.filter(o => display(o).toLowerCase().includes(q));
  useEffect(() => { setText(value ? (stripPrefix ? value.replace(stripPrefix, '') : value) : ''); }, [value]);
  return (
    <div style={{ position: 'relative' }}>
      <input value={text} placeholder={placeholder} style={{ ...inp, width: '100%' }}
        onChange={e => { setText(e.target.value); setOpen(true); onChange(''); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 6, maxHeight: 180, overflowY: 'auto', zIndex: 10, boxShadow: '0 6px 20px rgba(0,0,0,.4)' }}>
        {filtered.slice(0, 15).map(o => <div key={o} onMouseDown={() => { onChange(o); setText(display(o)); setOpen(false); }} style={{ padding: '6px 10px', fontSize: 12, color: T.tx, cursor: 'pointer', borderBottom: `1px solid ${T.bd}` }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{display(o)}</div>)}
      </div>}
    </div>
  );
};

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

// ── Add / Edit Modal ───────────────────────────────────────────────────────────
const MODAL_FIELDS: { key: keyof BrandTagRow; label: string; type?: string; multiline?: boolean; options?: string[]; searchable?: boolean; defaultVal?: string }[] = [
  { key: 'brand', label: 'Brand Name', options: BRAND_OPTIONS },
  { key: 'ean', label: 'EAN' },
  { key: 'sku', label: 'SKU' },
  { key: 'product', label: 'Product', options: PRODUCT_OPTIONS },
  { key: 'qty', label: 'Includes', options: QTY_OPTIONS, searchable: true },
  { key: 'size', label: 'Size', options: SIZE_OPTIONS },
  { key: 'color', label: 'Color', options: COLOR_OPTIONS, searchable: true },
  { key: 'mrp', label: 'MRP', type: 'number' },
  { key: 'mktd', label: 'MKTD & DIST. BY', multiline: true, defaultVal: DEFAULT_MKTD },
  { key: 'jioCode', label: 'Jio Code' },
];

const BrandTagModal = ({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  initial: BrandTagRow;
  onSave: (row: BrandTagRow) => void;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<BrandTagRow>({ ...initial });
  const set = (k: keyof BrandTagRow, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, backdropFilter: 'blur(8px)', padding: 8,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(14,18,30,0.96)', border: `1px solid ${T.bd2}`,
          borderRadius: 14, width: 480, maxWidth: '100%', maxHeight: '90vh',
          overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.65)',
          backdropFilter: 'blur(32px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '11px 14px', borderBottom: `1px solid ${T.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: T.tx, fontSize: 13, fontWeight: 600 }}>{title}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span>
        </div>
        {/* Fields */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MODAL_FIELDS.map(f => (
            <div key={f.key} style={{ position: 'relative' }}>
              <label style={fLabel}>{f.label}</label>
              {f.searchable && f.options ? (
                <SearchableSelect
                  value={String(form[f.key])}
                  options={f.options}
                  placeholder={`Type to search ${f.label.toLowerCase()}...`}
                  stripPrefix={f.key === 'qty' ? /^INCLUDES:\s*/i : undefined}
                  onChange={v => set(f.key, v)}
                />
              ) : f.options ? (
                <select
                  style={{ ...inp, width: '100%', cursor: 'pointer' }}
                  value={String(form[f.key])}
                  onChange={e => set(f.key, e.target.value)}
                >
                  <option value="">Select {f.label.toLowerCase()}</option>
                  {f.options.map(o => <option key={o} value={o}>{o.replace(/^BRAND NAME:\s*/i, '').replace(/^PRODUCT DESC:\s*/i, '').replace(/^INCLUDES:\s*/i, '')}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea
                  rows={2}
                  style={{ ...inp, width: '100%', resize: 'vertical' }}
                  value={String(form[f.key])}
                  onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  style={{ ...inp, width: '100%' }}
                  value={String(form[f.key])}
                  onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button style={btnGhost} onClick={onClose}>Cancel</button>
            <button style={btnPrimary} onClick={() => { const bad = validateRow(form); if (bad) { alert(`"${bad}" is required. Please fill all fields.`); return; } onSave(form); }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BrandTagPrinter() {
  // Server-side pagination + filtering
  const [rows, setRows] = useState<BrandTagRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
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
    let query = supabase.from('brand_tags').select('*', { count: 'exact' });
    if (search) query = query.ilike('search_text', `%${search.toLowerCase()}%`);
    if (brandFilter) query = query.ilike('brand', `%${brandFilter}%`);
    if (sizeFilter) query = query.eq('size', sizeFilter);
    if (colorFilter) query = query.eq('color', colorFilter);
    const from = btPage * btPerPage;
    const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + btPerPage - 1);
    if (data) setRows(data.map(d => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies })));
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [btPage, btPerPage, search, brandFilter, sizeFilter, colorFilter]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  // Lock body scroll when any modal/popup is open
  useEffect(() => {
    const hasModal = !!modalRow || !!orderRows;
    document.body.classList.toggle('modal-open', hasModal);
    return () => { document.body.classList.remove('modal-open'); };
  }, [modalRow, orderRows]);

  // Smart realtime: apply individual row changes without re-fetching entire page
  useEffect(() => {
    const mapRow = (d: any): BrandTagRow => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies });
    const ch = supabase.channel('bt-smart')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'brand_tags' }, (payload) => {
        const updated = mapRow(payload.new);
        setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'brand_tags' }, (payload) => {
        const id = (payload.old as any)?.id;
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
  useEffect(() => { setBtPage(0); }, [brandFilter, sizeFilter, colorFilter]);

  // Filter options are now preset constants (BRAND_OPTIONS, SIZE_OPTIONS, COLOR_OPTIONS)
  // Filtering happens server-side in fetchPage()
  const totalPages = Math.ceil(totalCount / btPerPage);

  // ── Import Excel ──
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
          alert('No rows found. Check that column headers match the expected format.');
          return;
        }
        // Validate all rows - reject file if any row has missing data
        const errors: string[] = [];
        imported.forEach((r, i) => {
          const bad = validateRow(r);
          if (bad) errors.push(`Row ${i + 1} (SKU: ${r.sku || 'empty'}): missing "${bad}"`);
        });
        if (errors.length > 0) {
          alert(`Import rejected — ${errors.length} row(s) have missing data:\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n...and ${errors.length - 10} more` : ''}\n\nFix the Excel file and re-import.`);
          return;
        }
        // Smart import with queue persistence
        const toUpsert = imported.map(r => ({
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
        alert(`Import complete! ${toUpsert.length} rows processed.${failed > 0 ? ` ${failed} failed.` : ''}`);
        fetchPage();
      } catch (_) {
        alert('Failed to parse Excel file. Ensure it is a valid .xlsx / .xls / .csv file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, []);

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

  const deleteRow = useCallback((id: string, sku: string) => {
    if (!window.confirm(`Delete SKU: ${sku || 'this row'}?`)) return;
    supabase.from('brand_tags').delete().eq('id', id).then(() => { btAudit('delete', `Deleted SKU: ${sku}`); fetchPage(); });
  }, [fetchPage]);

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
    const dbRow = { brand: updated.brand, ean: updated.ean, sku: updated.sku, qty: updated.qty, mrp: updated.mrp, size: updated.size, product: updated.product, color: updated.color, mktd: updated.mktd, jio_code: updated.jioCode, copies: updated.copies };
    if (modalMode === 'add') {
      supabase.from('brand_tags').insert(dbRow).then(({ error }) => { if (error) alert('Save failed: ' + error.message); else { btAudit('add', `Added SKU: ${updated.sku}`); fetchPage(); } });
    } else {
      supabase.from('brand_tags').update({ ...dbRow, updated_at: new Date().toISOString() }).eq('id', updated.id).then(({ error }) => { if (error) alert('Update failed: ' + error.message); else { btAudit('edit', `Edited SKU: ${updated.sku}`); fetchPage(); } });
    }
    setModalRow(null);
  }, [modalMode, fetchPage]);

  // ── Print Handlers ──
  const printSingle = useCallback((row: BrandTagRow) => {
    const bad = validateRow(row);
    if (bad) { alert(`Cannot print — "${bad}" is missing for SKU: ${row.sku || 'empty'}`); return; }
    printLabelsInWindow([row]);
  }, []);

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
        const allMaster: any[] = [];
        let from = 0; let more = true;
        while (more) {
          const { data } = await supabase.from('brand_tags').select('*').range(from, from + 999);
          if (data && data.length > 0) { allMaster.push(...data); from += 1000; }
          if (!data || data.length < 1000) more = false;
          setOrderLoadMsg(`${json.length} rows parsed. Master data: ${allMaster.length} loaded...`);
        }
        setOrderLoadMsg(`Matching ${json.length} orders against ${allMaster.length} SKUs...`);
        const masterRows: BrandTagRow[] = allMaster.map(d => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies }));
        const parsed = parseOrderSheet(json, masterRows);
        setOrderRows(parsed); setOrderPage(0);
        setOrderLoading(false); setOrderLoadMsg('');
      } catch { alert('Failed to parse order sheet.'); setOrderLoading(false); setOrderLoadMsg(''); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, []);

  const updateOrderCopies = (sku: string, brand: string, copies: number) => {
    setOrderRows(prev => prev ? prev.map(r => (r.sku === sku && r.brand === brand) ? { ...r, copies: Math.max(0, copies) } : r) : null);
  };

  const printOrderLabels = (items: OrderRow[]) => {
    const labels: BrandTagRow[] = [];
    items.forEach(r => {
      if (!r.found || !r.masterData || r.copies <= 0) return;
      for (let i = 0; i < r.copies; i++) labels.push({ ...r.masterData, brand: `BRAND NAME: ${r.brand}`, copies: 1 });
    });
    if (labels.length === 0) { alert('No printable labels. Ensure SKUs exist in master data and copies > 0.'); return; }
    printLabelsInWindow(labels);
  };

  const printTestLabel = useCallback(() => {
    const s = rows[0] || sampleRow();
    printLabelsInWindow([s]);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Brand Tags</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: T.tx3, marginLeft: 8 }}>{totalCount} rows</span>
          {importing && <span style={{ fontSize: 10, color: T.yl, marginLeft: 8, fontWeight: 600 }}>Importing {importProgress}...</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button style={btnGhost} onClick={async () => { setRefreshMsg('Refreshing...'); await fetchPage(); setRefreshMsg('Updated!'); setTimeout(() => setRefreshMsg(''), 2000); }}>{refreshMsg || 'Refresh'}</button>
          <button style={btnGhost} onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} />
          <button style={btnGhost} onClick={handleExport}>Export</button>
          <button style={{ ...btnGhost, color: T.yl, borderColor: 'rgba(251,191,36,.12)', opacity: orderLoading ? 0.5 : 1, pointerEvents: orderLoading ? 'none' : 'auto' }} onClick={() => orderFileRef.current?.click()}>Order Sheet</button>
          <input ref={orderFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleOrderImport} />
          {orderLoading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.yl }}><span style={{ width: 10, height: 10, border: '1.5px solid rgba(251,191,36,.2)', borderTopColor: T.yl, borderRadius: '50%', animation: 'btnSpin .6s linear infinite', flexShrink: 0 }} />{orderLoadMsg}</span>}
          <button style={{ ...btnGhost, color: T.yl, borderColor: 'rgba(251,191,36,.12)' }} onClick={printTestLabel}>Test Print</button>
          <button style={btnPrimary} onClick={openAdd}>+ Add SKU</button>
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid ' + T.bd, borderRadius: 8, padding: '8px 10px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <input type="text" placeholder="Search brand, SKU, EAN..." value={search} onChange={e => handleSearch(e.target.value)} style={{ ...inp, flex: 1, minWidth: 130, padding: '6px 9px' }} />
        <div style={{ width: 1, height: 20, background: T.bd2 }} />
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 100, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="">All brands</option>{BRAND_OPTIONS.map(b => { const n = b.replace(/^BRAND NAME:\s*/i, ''); return <option key={b} value={n}>{n}</option>; })}</select>
        <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 80, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="">All sizes</option>{SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 90, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="">All colors</option>{COLOR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8, background: 'rgba(255,255,255,0.015)', marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            {['Brand', 'EAN', 'SKU', 'Includes', 'MRP', 'Size', 'Product', 'Color', 'Jio Code', ''].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length === 0 && !loading && <tr><td colSpan={10} style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 10 }}>No rows. Import Excel or add SKUs.</td></tr>}
            {rows.map(row => (
              <tr key={row.id} style={{ transition: 'background .1s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <td style={tdS}>{row.brand.replace(/^BRAND NAME:\s*/i, '')}</td>
                <td style={tdS}>{row.ean}</td>
                <td style={{ ...tdS, fontWeight: 500 }}>{row.sku}</td>
                <td style={tdS}>{row.qty.replace(/^INCLUDES:\s*/i, '')}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtMrp(row.mrp)}</td>
                <td style={tdS}>{row.size}</td>
                <td style={tdS}>{row.product.replace(/^PRODUCT DESC:\s*/i, '')}</td>
                <td style={tdS}>{row.color}</td>
                <td style={tdS}>{row.jioCode}</td>
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
          <span onClick={() => setBtPage(Math.max(0, btPage - 1))} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10, opacity: btPage === 0 ? 0.3 : 1, pointerEvents: btPage === 0 ? 'none' : 'auto' }}>Prev</span>
          <span style={{ color: T.tx3 }}>{btPage + 1} / {totalPages}</span>
          <span onClick={() => setBtPage(Math.min(totalPages - 1, btPage + 1))} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10, opacity: btPage >= totalPages - 1 ? 0.3 : 1, pointerEvents: btPage >= totalPages - 1 ? 'none' : 'auto' }}>Next</span>
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
                  : <button style={{ ...btnGhost, opacity: 0.4, cursor: 'not-allowed' }} title="Resolve missing SKUs first">Print blocked</button>
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
                <span onClick={() => setOrderPage(Math.max(0, orderPage - 1))} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10, opacity: orderPage === 0 ? 0.3 : 1 }}>Prev</span>
                <span style={{ color: T.tx3 }}>{orderPage + 1} / {otp}</span>
                <span onClick={() => setOrderPage(Math.min(otp - 1, orderPage + 1))} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10, opacity: orderPage >= otp - 1 ? 0.3 : 1 }}>Next</span>
              </>}
            </div>
          </div>
        </div>;
      })()}

      {/* ── Add / Edit Modal ── */}
      {modalRow && (
        <BrandTagModal
          title={modalMode === 'add' ? 'Add New SKU' : `Edit: ${modalRow.sku || 'SKU'}`}
          initial={modalRow}
          onSave={handleModalSave}
          onClose={() => setModalRow(null)}
        />
      )}
      </>}
    </div>
  );
}
