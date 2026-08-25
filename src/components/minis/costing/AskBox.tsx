// The "ask" box on the Product Costing home: type a question, get an instant
// answer computed from the loaded costings — every supplier's rate shown, the
// costing one ticked. Deterministic (costingAsk.ts); nothing is estimated.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { CostingProduct, money } from './costingModel';
import { askCosting, AskAnswer } from './costingAsk';

export default function AskBox({ products }: { products: CostingProduct[] }) {
  const [q, setQ] = useState('');
  const [ans, setAns] = useState<AskAnswer | null>(null);

  const run = () => setAns(q.trim() ? askCosting(q, products) : null);

  const card: React.CSSProperties = { border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.015)', marginTop: 6 };
  const supLine = (s: { name: string; materialCode: string; rate: number; selected: boolean }, i: number) => (
    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, color: T.tx2, padding: '2px 0', flexWrap: 'wrap' }}>
      <span style={{ color: s.selected ? T.gr : T.tx2 }}>{s.selected ? '✓ ' : ''}{s.name}</span>
      {s.materialCode && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3 }}>{s.materialCode}</span>}
      <span style={{ fontFamily: T.mono, color: s.selected ? T.ac2 : T.tx }}>{money(s.rate)}</span>
      {s.selected && <span style={{ fontSize: 9, color: T.tx3 }}>(prices the costing)</span>}
    </div>
  );

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') run(); }}
          placeholder='Ask — e.g. "cost of fabric salsa", "what do we buy from Arvachin", "DRS210 cost"'
          style={{ ...S.fInput, flex: 1, minWidth: 0 }} />
        <button onClick={run} style={{ ...S.btnPrimary, minHeight: 36 }}>Ask</button>
        {ans && <button onClick={() => { setAns(null); setQ(''); }} style={{ ...S.btnGhost, minHeight: 36 }}>Clear</button>}
      </div>

      {ans?.kind === 'none' && (
        <div style={{ fontSize: 11, color: T.yl, marginTop: 8, lineHeight: 1.6 }}>{ans.hint}</div>
      )}

      {ans?.kind === 'item' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: T.tx3 }}>
            {ans.approx ? <>Nothing matches &ldquo;{ans.term}&rdquo; exactly — closest match:</> : <>&ldquo;{ans.term}&rdquo;:</>}
          </div>
          {ans.groups.map((g, i) => (
            <div key={i} style={card}>
              {/* The material ONCE: its supplier(s) and rate stated a single
                  time, then a compact line per product that uses it. */}
              <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>{g.name}</div>
              <div style={{ marginTop: 2 }}>
                {g.suppliers.length ? g.suppliers.map(supLine) : <span style={{ fontSize: 10, color: T.tx3 }}>No supplier entered</span>}
              </div>
              <div style={{ marginTop: 6, borderTop: `1px solid ${T.bd}`, paddingTop: 6 }}>
                <div style={{ fontSize: 9.5, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  Used on {g.uses.length} line{g.uses.length === 1 ? '' : 's'}
                </div>
                {g.uses.map((u, j) => (
                  <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, color: T.tx2, padding: '2px 0', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: T.mono, color: T.ac2 }}>{u.sku}</span>
                    <span style={{ fontSize: 10, color: T.tx3 }}>{u.component}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: T.mono }}>{u.qty} {u.unit} → {money(u.cost)}</span>
                  </div>
                ))}
                {g.uses.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: T.tx, borderTop: `1px solid ${T.bd}`, paddingTop: 4, marginTop: 2 }}>
                    <span>Total across products</span><span style={{ fontFamily: T.mono, color: T.ac2 }}>{money(g.totalCost)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {ans?.kind === 'supplier' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: T.tx3 }}>
            From <b style={{ color: T.tx }}>{ans.name}</b> — {ans.hits.length} item{ans.hits.length === 1 ? '' : 's'} across your costings:
          </div>
          {ans.hits.map((h, i) => (
            <div key={i} style={card}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: T.tx, fontSize: 12 }}>{h.sub || '(unnamed)'}</span>
                <span style={{ color: T.tx3, fontSize: 10 }}>{h.component}</span>
                <span style={{ fontFamily: T.mono, color: T.ac2, fontSize: 10 }}>{h.sku}</span>
                {h.materialCode && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3 }}>{h.materialCode}</span>}
                <span style={{ marginLeft: 'auto', fontFamily: T.mono, color: h.selected ? T.ac2 : T.tx }}>{money(h.rate)}{h.selected ? ' ✓' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {ans?.kind === 'product' && (
        <div style={{ marginTop: 8 }}>
          <div style={card}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: T.tx }}>{ans.hit.sku}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontFamily: T.mono, color: T.ac2 }}>{money(ans.hit.perPc)}/pc incl. maintenance</span>
            </div>
            {ans.hit.components.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx2, padding: '2px 0' }}>
                <span>{c.name}</span><span style={{ fontFamily: T.mono }}>{money(c.cost)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, borderTop: `1px solid ${T.bd}`, paddingTop: 4, marginTop: 2 }}>
              <span>Before maintenance</span><span style={{ fontFamily: T.mono }}>{money(ans.hit.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
