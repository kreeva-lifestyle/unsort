// Money tab of a jobworker's statement: a timeline grouped by day, newest
// first, each money line carrying its amount under its own word — Billed
// or Paid, never Dr/Cr — and the running balance as a sentence under every money line ("You owe
// ₹10,377"). Piece events (job opened, handed over, rework) sit in the same
// timeline in grey with the money cells empty, so the money adds up on its
// own. A filter keeps all / money only / pieces only. A line opens its job.
// Without money rights the same timeline shows only the pieces side.
import { T, S } from '../../lib/theme';
import { useProgressive } from '../../hooks/useProgressive';
import { fmtDate, inr, today } from './jobworkModel';
import { lineText, rateText, owed, byDay, isMoney, type LedgerRow, type RowFilter } from './jobworkLedger';

const KIND: Record<LedgerRow['kind'], { label: string; color: string }> = {
  given: { label: 'Job opened', color: T.tx3 }, out: { label: 'Handed over', color: T.tx3 }, in: { label: 'Received', color: T.gr }, payment: { label: 'Paid', color: T.ac2 },
};
const toneColor: Record<string, string> = { yl: T.yl, bl: T.bl, gr: T.gr, tx3: T.tx3 };
const dayLabel = (d: string) => (d === today() ? `Today · ${fmtDate(d)}` : fmtDate(d));

export default function LedgerRows({ rows, boss, name, opening, hasFrom, filter, onFilter, onOpen }: {
  rows: LedgerRow[]; boss: boolean; name: string; opening: number; hasFrom: boolean; filter: RowFilter; onFilter: (f: RowFilter) => void; onOpen: (orderId: string) => void;
}) {
  const kept = rows.filter(r => (boss ? filter === 'all' || (filter === 'money' ? isMoney(r) : !isMoney(r)) : !isMoney(r) || r.kind === 'in'));
  const days = byDay(useProgressive(kept, false, 40));
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '4px 12px', fontSize: 11, ...(on ? { border: `1px solid ${T.ac}`, color: T.ac2, background: T.ac3 } : {}) });
  // The amount carries its own word ("Billed" / "Paid") so a column heading is never needed, on any width.
  const cell = (label: string, v: number, color: string) => (
    <div style={{ textAlign: 'right', minWidth: 84 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color }}>{inr(v)}</div>
    </div>
  );
  return (
    <div>
      {boss && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['all', 'money', 'pieces'] as RowFilter[]).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => onFilter(f)} style={chip(filter === f)}>{f === 'all' ? 'Everything' : f === 'money' ? 'Money only' : 'Pieces only'}</button>)}
        </div>
      )}
      {days.map(g => (
        <div key={g.d} style={{ marginBottom: 10 }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: T.bg, padding: '6px 2px', fontSize: 11, fontWeight: 700, color: T.tx2 }}>{dayLabel(g.d)}</div>
          <div style={{ border: `1px solid ${T.bd}`, borderRadius: T.rLg, overflow: 'hidden', background: T.glass1 }}>
            {g.rows.map((r, i) => {
              const money = isMoney(r);
              const sub = [boss ? rateText(r) : '', r.note || ''].filter(Boolean).join(' · ');
              const bal = owed(name, r.balance);
              return (
                <button key={`${r.order_id}-${r.kind}-${i}`} type="button" onClick={() => onOpen(r.order_id)}
                  style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'flex-start', padding: '10px 14px', minHeight: 44, background: 'none', border: 'none', borderTop: i ? `1px solid ${T.bd}` : 'none', textAlign: 'left', color: T.tx, font: 'inherit', cursor: 'pointer', opacity: money || !boss ? 1 : 0.7 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: KIND[r.kind].color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{KIND[r.kind].label} · <span style={{ fontFamily: T.mono, color: T.ac2 }}>JW #{r.jw}</span> <span style={{ fontFamily: T.mono, color: T.tx2 }}>{r.sku}</span></div>
                    <div style={{ fontSize: 13, color: money || !boss ? T.tx : T.tx2, marginTop: 2 }}>{lineText(r)}</div>
                    {sub && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{sub}</div>}
                    {boss && money && <div style={{ fontSize: 11, color: toneColor[bal.tone], marginTop: 4, fontFamily: T.mono }}>→ {bal.text}</div>}
                  </div>
                  {boss && money && <div style={{ flexShrink: 0, paddingTop: 2 }}>{r.kind === 'in' ? cell('Billed', r.amount, T.tx) : cell('Paid', r.paid, T.gr)}</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {boss && hasFrom && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: `1px solid ${T.bd}`, borderRadius: T.rLg, fontSize: 12, color: T.tx2 }}>
          <span>Balance before this period</span><b style={{ fontFamily: T.mono, color: toneColor[owed(name, opening).tone] }}>{owed(name, opening).text}</b>
        </div>
      )}
      {kept.length === 0 && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Nothing here for this period and filter.</div>}
    </div>
  );
}
