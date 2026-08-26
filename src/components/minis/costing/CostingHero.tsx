// The editor's top: hero card (photo · SKU · cost/pc) and the selling-price
// + margin strip beneath it — the money is the headline of the redesign.
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingProduct, money, num } from './costingModel';

export default function CostingHero({ p, total, uploading, onSku, onSelling, onFile }: {
  p: CostingProduct;
  total: number;
  uploading: boolean;
  onSku: (v: string) => void;
  onSelling: (v: string) => void;
  onFile: (f: File | undefined) => void;
}) {
  const sell = num(p.selling_price ?? '');
  const lines = p.components.reduce((t, c) => t + c.subs.length, 0);
  return (<>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <label title="Tap to add or replace the product photo" style={{ width: 64, height: 64, borderRadius: 10, border: `1.5px dashed ${T.bd2}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        <input type="file" accept="image/*" style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {p.image_url
          ? <img src={p.image_url} alt={p.sku || 'product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 9, color: T.tx3, textAlign: 'center', lineHeight: 1.4 }}>{uploading ? 'Uploading…' : '+ photo'}</span>}
      </label>
      <div style={{ flex: 1, minWidth: 130 }}>
        <input id="cost-f-sku" value={p.sku} onChange={e => onSku(e.target.value)}
          placeholder="SKU *" style={{ ...S.fInput, width: '100%', textTransform: 'uppercase', fontFamily: T.mono, fontWeight: 700 }} />
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{p.components.length} component{p.components.length === 1 ? '' : 's'} · {lines} line{lines === 1 ? '' : 's'}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 800, color: T.ac2 }}>{money(total)}</div>
        <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>cost / pc · incl {num(p.maintenance_pct)}%</div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'oklch(0.72 0.19 145 / .05)', border: '1px solid oklch(0.72 0.19 145 / .18)', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
      <div>
        <label style={S.fLabel}>Selling price</label>
        <input value={p.selling_price ?? ''} onChange={e => onSelling(e.target.value)}
          onKeyDown={e => numericKeyDown(e)} type="number" min="0" placeholder="₹"
          style={{ ...S.fInput, width: 110, fontFamily: T.mono }} />
      </div>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: T.tx3 }}>Margin</div>
        {sell > 0
          ? <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: sell - total >= 0 ? T.gr : T.re }}>{money(sell - total)} · {((sell - total) / sell * 100).toFixed(1)}%</div>
          : <div style={{ fontSize: 10.5, color: T.tx3 }}>enter selling price to see it</div>}
      </div>
    </div>
  </>);
}
