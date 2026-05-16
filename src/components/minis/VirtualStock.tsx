import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';

export default function VirtualStock({ stock, setStock }: { stock: Record<string, number>; setStock: (s: Record<string, number>) => void }) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');

  const add = () => {
    const s = sku.trim();
    const q = parseInt(qty) || 0;
    if (!s || q <= 0) return;
    setStock({ ...stock, [s]: (stock[s] || 0) + q });
    setSku(''); setQty('');
  };

  const entries = Object.entries(stock).filter(([, v]) => v > 0);

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, marginBottom: 2 }}>Virtual Stock Override</div>
      <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Add manual stock for SKUs that show 0 but you have in inventory. Applies to all exports.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: entries.length > 0 ? 10 : 0 }}>
        <input value={sku} onChange={e => setSku(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="SKU code" style={{ ...S.fInput, flex: 1, fontFamily: T.mono }} />
        <input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') add(); }} placeholder="Qty" style={{ ...S.fInput, width: 70, textAlign: 'right', fontFamily: T.mono }} />
        <div onClick={add} style={{ ...S.btnPrimary, flexShrink: 0 }}>Add</div>
      </div>
      {entries.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {entries.map(([s, q]) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontFamily: T.mono, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', color: T.gr }}>
            {s}: +{q}
            <span onClick={() => { const n = { ...stock }; delete n[s]; setStock(n); }} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>x</span>
          </span>
        ))}
      </div>}
    </div>
  );
}
