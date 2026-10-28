// The lines of one jobworker's ledger: a table on desktop, cards on a phone
// (only the one on screen is built). Each line is one dated event on one job —
// work given, rework or material sent, pieces received (billed), payment —
// and opens its job when tapped. Money columns only for admin/manager; on a
// phone the amount and balance show only on lines where money moved.
import { T, S } from '../../lib/theme';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useProgressive } from '../../hooks/useProgressive';
import { shortDate, inr } from './jobworkModel';
import { lineText, rateText, balanceWords, type LedgerRow } from './jobworkLedger';

const KIND: Record<LedgerRow['kind'], { label: string; color: string }> = {
  given: { label: 'Given', color: T.bl }, out: { label: 'Sent', color: T.yl }, in: { label: 'Received', color: T.gr }, payment: { label: 'Paid', color: T.ac2 },
};
const money = (v: number) => (Math.abs(v) < 0.005 ? '' : inr(v));

export default function LedgerRows({ rows, boss, opening, hasFrom, onOpen }: {
  rows: LedgerRow[]; boss: boolean; opening: number; hasFrom: boolean; onOpen: (orderId: string) => void;
}) {
  const phone = useIsPhone();
  const shown = useProgressive(rows, false, 20);
  const job = (r: LedgerRow) => <><span style={{ fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>JW #{r.jw}</span><span style={{ fontFamily: T.mono, marginLeft: 8, color: T.tx }}>{r.sku}</span></>;
  const sub = (r: LedgerRow) => [boss ? rateText(r) : '', r.note || ''].filter(Boolean).join(' · ');
  const openingLine = boss && hasFrom;

  if (phone) return (
    <div style={{ border: `1px solid ${T.bd}`, borderRadius: T.rLg, overflow: 'hidden', background: T.glass1 }}>
      {openingLine && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, fontSize: 12, color: T.tx2 }}><span>Opening balance</span><b style={{ fontFamily: T.mono }}>{inr(opening)}</b></div>}
      {shown.map((r, i) => (
        <button key={`${r.order_id}-${r.kind}-${i}`} type="button" onClick={() => onOpen(r.order_id)}
          style={{ display: 'flex', width: '100%', gap: 10, padding: '10px 14px', minHeight: 44, background: 'none', border: 'none', borderBottom: `1px solid ${T.bd}`, textAlign: 'left', color: T.tx, font: 'inherit', cursor: 'pointer' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: T.tx3, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>{shortDate(r.d)}</span>
              <span style={{ color: KIND[r.kind].color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{KIND[r.kind].label}</span>
            </div>
            <div style={{ fontSize: 12, marginTop: 2 }}>{job(r)}</div>
            <div style={{ fontSize: 12, color: T.tx2, marginTop: 2 }}>{lineText(r)}</div>
            {sub(r) && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{sub(r)}</div>}
          </div>
          {boss && (r.amount || r.paid) ? (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {r.amount ? <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>+{inr(r.amount)}</div> : null}
              {r.paid ? <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.gr }}>−{inr(r.paid)}</div> : null}
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3, marginTop: 2 }}>{balanceWords(r.balance)}</div>
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );

  const th = (label: string, right = false, w?: number) => <th style={{ ...S.thStyle, textAlign: right ? 'right' : 'left', width: w, whiteSpace: 'nowrap' }}>{label}</th>;
  const td: React.CSSProperties = { ...S.tdStyle, padding: '9px 14px', verticalAlign: 'top', borderTop: `1px solid ${T.bd}` };
  const num: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: T.mono, whiteSpace: 'nowrap' };
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: boss ? 860 : 620 }}>
        <thead><tr>{th('Date', false, 90)}{th('Job', false, 190)}{th('What happened')}{boss && th('Work done', true)}{boss && th('Paid', true)}{boss && th('Balance', true)}</tr></thead>
        <tbody>
          {openingLine && (
            <tr><td style={td} colSpan={3}><span style={{ color: T.tx2 }}>Opening balance</span></td><td style={num} /><td style={num} /><td style={{ ...num, color: T.tx, fontWeight: 700 }}>{inr(opening)}</td></tr>
          )}
          {shown.map((r, i) => (
            <tr key={`${r.order_id}-${r.kind}-${i}`} className="jw-row" onClick={() => onOpen(r.order_id)} style={{ cursor: 'pointer' }}>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <div>{shortDate(r.d)}</div>
                <div style={{ fontSize: 10, color: KIND[r.kind].color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{KIND[r.kind].label}</div>
              </td>
              <td style={{ ...td, fontSize: 12 }}>{job(r)}</td>
              <td style={td}>
                <div style={{ color: T.tx2 }}>{lineText(r)}</div>
                {sub(r) && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{sub(r)}</div>}
              </td>
              {boss && <td style={{ ...num, color: T.tx }}>{money(r.amount)}</td>}
              {boss && <td style={{ ...num, color: T.gr }}>{money(r.paid)}</td>}
              {boss && <td style={{ ...num, color: r.balance > 0.005 ? T.tx : T.tx3 }}>{inr(r.balance)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
