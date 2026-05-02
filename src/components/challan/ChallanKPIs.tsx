// 3-stat strip used inside Bulk Pay flow:
//   Outstanding (sales) · Returns · Net amount
// Extracted from CashChallan.tsx so the bulk modal stays presentational.
import { T } from '../../lib/theme';

interface Props {
  payableCount: number;
  outstanding: number;
  returnsCount: number;
  returnsTotal: number;
  netTotal: number;
}

export default function ChallanKPIs({ payableCount, outstanding, returnsCount, returnsTotal, netTotal }: Props) {
  const isRefund = netTotal < 0;
  return (
    <>
      <div className="challan-kpi-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 11 }}>
        <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 8, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Outstanding ({payableCount})</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.gr }}>₹{outstanding.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 8, color: T.re, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Returns ({returnsCount})</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.re }}>₹{returnsTotal.toLocaleString('en-IN')}</div>
        </div>
      </div>
      <div style={{ background: !isRefund ? 'rgba(99,102,241,.06)' : 'rgba(239,68,68,.06)', border: `1px solid ${!isRefund ? 'rgba(99,102,241,.15)' : 'rgba(239,68,68,.15)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 8, color: !isRefund ? T.ac2 : T.re, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{!isRefund ? 'Net Amount' : 'You Owe Customer'}</div>
        <div style={{ fontSize: 'clamp(16px, 5vw, 20px)', fontWeight: 800, fontFamily: T.sora, color: !isRefund ? T.gr : T.re, wordBreak: 'break-word' }}>₹{Math.abs(netTotal).toLocaleString('en-IN')}</div>
        {isRefund && <div style={{ fontSize: 9, color: T.tx3, marginTop: 4 }}>Returns exceed outstanding. Sales will be settled against returns, refund the difference.</div>}
      </div>
    </>
  );
}
