// The editor's top card: product photo (tap to add or replace), SKU and
// category side by side on desktop, one column on the phone (.two-col).
// The money lives in the rail / phone bar, not here.
import { T, S } from '../../../lib/theme';
import { CostingProduct } from './costingModel';

export default function CostingHero({ p, uploading, categories, onSku, onCategory, onFile }: {
  p: CostingProduct;
  uploading: boolean;
  categories: string[];
  onSku: (v: string) => void;
  onCategory: (v: string) => void;
  onFile: (f: File | undefined) => void;
}) {
  const lines = p.components.reduce((t, c) => t + c.subs.length, 0);
  return (
    <div className="cost-hero" style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rXl, padding: 12 }}>
      <label title="Tap to add or replace the product photo" style={{ width: 72, height: 72, borderRadius: 10, border: `1.5px dashed ${T.bd2}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        <input type="file" accept="image/*" style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {p.image_url && !uploading
          ? <img src={p.image_url} alt={p.sku || 'product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 9, color: T.tx3, textAlign: 'center', lineHeight: 1.4 }}>{uploading ? 'Uploading…' : '+ photo'}</span>}
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input id="cost-f-sku" value={p.sku} onChange={e => onSku(e.target.value)} aria-label="SKU"
            placeholder="SKU *" style={{ ...S.fInput, textTransform: 'uppercase', fontFamily: T.mono, fontWeight: 700 }} />
          {/* Category comes from Settings → Categories and is compulsory (the
              Price Projector keys its thresholds by it). A stored value that is
              no longer in Settings stays selectable so old sheets still open. */}
          <select id="cost-f-category" value={p.category || ''} onChange={e => onCategory(e.target.value)} aria-label="Category" required
            style={{ ...S.fInput, cursor: 'pointer', color: p.category ? T.tx : T.tx3 }}>
            <option value="">Category *</option>
            {p.category && !categories.includes(p.category) && <option value={p.category}>{p.category}</option>}
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>{p.components.length} component{p.components.length === 1 ? '' : 's'} · {lines} line{lines === 1 ? '' : 's'}</div>
      </div>
    </div>
  );
}
