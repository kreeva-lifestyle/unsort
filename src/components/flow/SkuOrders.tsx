// The POs and job work found for a SKU, as a list. Two uses:
//  - "pick" (new pipeline): tick which to link; open ones come ticked.
//  - "add" (canvas): the ones not on the canvas yet, each with + Add.
import { T, S } from '../../lib/theme';
import { fmtDay, tint } from './flowModel';
import { orderLabel, orderSub, type SkuOrder } from './skuFinds';

type Props = { sku: string; orders: SkuOrder[] | null; error?: string } & (
  | { mode: 'pick'; picked: Set<string>; onToggle: (id: string) => void }
  | { mode: 'add'; adding: string | null; onAdd: (o: SkuOrder) => void }
);

export default function SkuOrders(p: Props) {
  if (p.error) return <div style={{ fontSize: 11, color: T.re }}>{p.error}</div>;
  if (p.orders === null) return <div style={{ fontSize: 11, color: T.tx3 }}>Looking for {p.sku}'s POs and job work…</div>;
  if (!p.orders.length) return <div style={{ fontSize: 11, color: T.tx3 }}>{p.mode === 'add' ? `Every PO and job work for ${p.sku} is on the canvas.` : `No POs or job work for ${p.sku} yet — you can link them later.`}</div>;
  const po = p.orders.filter(o => o.kind === 'po').length;
  const jw = p.orders.length - po;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: T.tx2 }}>
        Found for <b style={{ fontFamily: T.mono }}>{p.sku}</b>: {[po ? `${po} PO${po === 1 ? '' : 's'}` : null, jw ? `${jw} job work` : null].filter(Boolean).join(' · ')}
        {p.mode === 'pick' && <span style={{ color: T.tx3 }}> — ticked ones are linked into the steps</span>}
      </span>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
        {p.orders.map(o => {
          const c = o.open ? (o.kind === 'po' ? T.bl : T.yl) : T.gr;
          const on = p.mode === 'pick' && p.picked.has(o.id);
          const row = (
            <>
              {p.mode === 'pick' && <input type="checkbox" checked={on} readOnly tabIndex={-1} style={{ width: 16, height: 16, accentColor: T.ac, flexShrink: 0 }} />}
              <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono }}>{orderLabel(o)}</span>
                <span style={{ fontSize: 10, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{orderSub(o)}{o.due ? ` · due ${fmtDay(o.due)}` : ''}</span>
              </span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tint(c, 0.1), color: c, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{o.status}</span>
            </>
          );
          const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', minHeight: 44, border: 'none', borderBottom: `1px solid ${T.bd}`, background: on ? T.ac3 : 'transparent', color: T.tx, textAlign: 'left', fontFamily: T.sans };
          return p.mode === 'pick'
            ? <button key={o.id} type="button" role="checkbox" aria-checked={on} onClick={() => p.onToggle(o.id)} style={{ ...rowStyle, cursor: 'pointer' }}>{row}</button>
            : (
              <div key={o.id} style={rowStyle}>
                {row}
                <button type="button" onClick={() => p.onAdd(o)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, pointerEvents: p.adding ? 'none' : 'auto', opacity: p.adding ? 0.5 : 1 }}>{p.adding === o.id ? 'Adding…' : '+ Add'}</button>
              </div>
            );
        })}
      </div>
    </div>
  );
}
