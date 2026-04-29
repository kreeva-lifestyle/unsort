import React from 'react';
import JsBarcode from 'jsbarcode';
import { T, S } from '../../lib/theme';

interface BrandTagRow {
  id: string; brand: string; ean: string; sku: string; qty: string;
  mrp: number; size: string; product: string; color: string;
  mktd: string; jioCode: string; copies: number;
}

interface Props {
  mode: 'add' | 'edit';
  initial: BrandTagRow;
  onSave: (row: BrandTagRow) => void;
  onClose: () => void;
  brandOptions: string[];
  productOptions: string[];
  sizeOptions: string[];
  colorOptions: string[];
  qtyOptions: string[];
  validateRow: (row: BrandTagRow) => string | null;
}

const fLabel: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' };
const fInput: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '8px 12px', height: 36, outline: 'none', boxSizing: 'border-box' };
const fSelect: React.CSSProperties = { ...fInput, cursor: 'pointer' };

export default function BrandTagModal({ mode, initial, onSave, onClose, brandOptions, productOptions, sizeOptions, colorOptions, qtyOptions, validateRow }: Props) {
  const [form, setForm] = React.useState<BrandTagRow>({ ...initial });
  const [error, setError] = React.useState('');
  const barcodeRef = React.useRef<SVGSVGElement>(null);
  const set = (k: keyof BrandTagRow, v: string | number) => { setError(''); setForm(p => ({ ...p, [k]: v })); };

  const brand = form.brand.replace(/^BRAND NAME:\s*/i, '').trim();
  const product = form.product.replace(/^PRODUCT DESC:\s*/i, '').trim();
  const mrpStr = '₹' + (form.mrp || 0).toLocaleString('en-IN');

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  React.useEffect(() => {
    if (!barcodeRef.current || !form.jioCode) return;
    try {
      JsBarcode(barcodeRef.current, form.jioCode, { format: 'CODE128', width: 1.5, height: 32, displayValue: false, margin: 0 });
    } catch { /* invalid barcode value */ }
  }, [form.jioCode, form.sku]);

  const handleSave = () => {
    const bad = validateRow(form);
    if (bad) { setError(`"${bad}" is required.`); return; }
    onSave(form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(8px)', padding: 8 }} onClick={onClose}>
      <div className="modal-inner" style={{ background: 'rgba(14,18,30,0.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: 720, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.65)', backdropFilter: 'blur(32px)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>{mode === 'add' ? 'New brand tag' : 'Edit brand tag'}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Master record · prints on 1.97 × 2.97 in label</div>
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)' }}>&times;</span>
        </div>

        {/* Body — form + live preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 20, padding: '16px 20px' }} className="two-col">
          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={fLabel}>Brand *</label><select value={form.brand} onChange={e => set('brand', e.target.value)} style={fSelect}><option value="">Select brand</option>{brandOptions.map(o => <option key={o} value={o}>{o.replace(/^BRAND NAME:\s*/i, '')}</option>)}</select></div>
              <div><label style={fLabel}>SKU *</label><input value={form.sku} onChange={e => set('sku', e.target.value)} style={fInput} placeholder="e.g. TNDRS177-M" /></div>
            </div>
            <div><label style={fLabel}>Product *</label><input value={product} onChange={e => set('product', e.target.value ? 'PRODUCT DESC: ' + e.target.value : '')} list="dl-prod" style={fInput} placeholder="e.g. Co-ord Set" /><datalist id="dl-prod">{productOptions.map(o => <option key={o} value={o.replace(/^PRODUCT DESC:\s*/i, '')} />)}</datalist></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={fLabel}>Size</label><select value={form.size} onChange={e => set('size', e.target.value)} style={fSelect}><option value="">Select size</option>{sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label style={fLabel}>Color</label><input value={form.color} onChange={e => set('color', e.target.value)} list="dl-color" style={fInput} placeholder="e.g. Maroon" /><datalist id="dl-color">{colorOptions.map(c => <option key={c} value={c} />)}</datalist></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={fLabel}>EAN-13 *</label><input value={form.ean} onChange={e => set('ean', e.target.value)} style={{ ...fInput, fontFamily: T.mono }} placeholder="8905738880431" /></div>
              <div><label style={fLabel}>Jio Tag</label><input value={form.jioCode} onChange={e => set('jioCode', e.target.value)} style={{ ...fInput, fontFamily: T.mono }} placeholder="JIO-A41" /></div>
            </div>
            <div><label style={fLabel}>MRP (₹) *</label><input type="number" value={form.mrp || ''} onChange={e => set('mrp', Number(e.target.value))} style={{ ...fInput, fontFamily: T.mono }} placeholder="6800" /></div>
            <div><label style={fLabel}>Includes</label><input value={form.qty.replace(/^INCLUDES:\s*/i, '')} onChange={e => set('qty', e.target.value ? 'INCLUDES: ' + e.target.value : '')} list="dl-qty" style={fInput} placeholder="1 U Top, 1 U Bottom, 1 U Dupatta" /><datalist id="dl-qty">{qtyOptions.map(o => <option key={o} value={o.replace(/^INCLUDES:\s*/i, '')} />)}</datalist></div>
            <div><label style={fLabel}>Mktd &amp; Dist. By</label><textarea value={form.mktd} onChange={e => set('mktd', e.target.value)} rows={2} style={{ ...fInput, height: 'auto', resize: 'vertical' }} /></div>
          </div>

          {/* Live preview */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, textAlign: 'center' }}>Live Preview</div>
            <div style={{ width: '100%', aspectRatio: '1.97/2.97', background: '#fff', borderRadius: 6, padding: '8px 10px 6px', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', color: '#000', fontSize: 8, lineHeight: 1.35, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontWeight: 700, fontSize: 9 }}>BRAND: {brand || '—'}</div>
              <div style={{ fontWeight: 700, fontSize: 9 }}>SKU: {form.sku || '—'}</div>
              <div>PRODUCT: {product || '—'}</div>
              <div>{form.qty.replace(/^INCLUDES:\s*/i, '') || '—'}</div>
              <div>SIZE: {form.size || '—'}  COLOR: {form.color || '—'}</div>
              <div style={{ fontSize: 6, color: '#555', marginTop: 2 }}>Mktd by: {(form.mktd || '').slice(0, 60)}</div>
              <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 10 }}>MRP {mrpStr}</div>
                {form.jioCode ? <svg ref={barcodeRef} style={{ width: '100%', height: 28, marginTop: 2 }} /> : <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', borderRadius: 3, fontSize: 7, color: '#999' }}>Barcode preview</div>}
              </div>
            </div>
            <div style={{ fontSize: 9, color: T.tx3, textAlign: 'center', marginTop: 6 }}>Updates as you type</div>
          </div>
        </div>

        {/* Footer */}
        {error && <div style={{ ...S.errorBox, margin: '0 20px 12px' }}>{error}</div>}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={handleSave} style={{ ...S.btnPrimary, gap: 6 }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M20 6L9 17l-5-5" /></svg>
            {mode === 'add' ? 'Create tag' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { BrandTagRow };
