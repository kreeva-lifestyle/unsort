// Bulk-mode toolbar + Bulk Pay / Bulk Unpay modals + last-batch undo banner.
// Extracted from CashChallan.tsx — parent owns the data + RPC calls.
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import ChallanKPIs from './ChallanKPIs';
import type { CashChallan } from '../../types/database';

type Challan = Omit<CashChallan, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string };

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

interface Props {
  bulkMode: boolean;
  selectedCount: number;
  payable: Challan[];
  unpayable: Challan[];
  returns: Challan[];
  outstanding: number;
  returnsTotal: number;
  netTotal: number;
  bulkBusy: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  // Last batch banner
  lastBatch: { id: string; count: number; mode: string } | null;
  undoingBatch: boolean;
  onUndoBatch: () => void;
  onDismissBatch: () => void;
  // Bulk pay modal
  showBulkPay: boolean;
  onOpenBulkPay: () => void;
  onCloseBulkPay: () => void;
  bulkPayMode: string;
  setBulkPayMode: (v: string) => void;
  bulkReceivedAmount: string;
  setBulkReceivedAmount: (v: string) => void;
  onConfirmBulkPay: () => void;
  // Bulk unpay modal
  showBulkUnpay: boolean;
  onOpenBulkUnpay: () => void;
  onCloseBulkUnpay: () => void;
  onConfirmBulkUnpay: () => void;
}

export default function ChallanBulkActions(p: Props) {
  return (
    <>
      {p.bulkMode && (
        <div className="challan-bulk-toolbar" style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', background: T.ac3, border: `1px solid ${T.bd2}`, borderRadius: 6 }}>
          <span style={{ fontSize: 10, color: T.tx2, fontWeight: 600 }}>{p.selectedCount} selected</span>
          <button onClick={p.onSelectAll} style={{ ...S.btnGhost, ...S.btnSm }}>Select All</button>
          <button onClick={p.onClearSelection} style={{ ...S.btnGhost, ...S.btnSm }}>Clear</button>
          <div style={{ flex: 1 }} />
          {p.payable.length > 0 && <button onClick={p.onOpenBulkPay} style={{ ...S.btnSuccess, ...S.btnSm, padding: '4px 12px' }}>Bulk Pay ({p.payable.length})</button>}
          {p.unpayable.length > 0 && <button onClick={p.onOpenBulkUnpay} style={{ ...S.btnWarn, ...S.btnSm, padding: '4px 12px' }}>Bulk Unpay ({p.unpayable.length})</button>}
        </div>
      )}

      {p.lastBatch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 6 }}>
          <span style={{ fontSize: 10, color: T.gr, fontWeight: 600, flex: 1 }}>{p.lastBatch.id}: {p.lastBatch.count} challans paid via {p.lastBatch.mode}</span>
          <button disabled={p.undoingBatch} onClick={p.onUndoBatch} style={{ ...S.btnDanger, ...S.btnSm, padding: '4px 10px', pointerEvents: p.undoingBatch ? 'none' : 'auto', opacity: p.undoingBatch ? 0.5 : 1 }}>{p.undoingBatch ? 'Undoing…' : 'Undo Batch'}</button>
          <span onClick={p.onDismissBatch} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }} aria-label="Dismiss">&times;</span>
        </div>
      )}

      {p.showBulkPay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }} onClick={p.onCloseBulkPay}>
          <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 12 }}>{p.netTotal < 0 ? 'Settle & Refund' : 'Bulk Pay'}</div>
            <ChallanKPIs payableCount={p.payable.length} outstanding={p.outstanding} returnsCount={p.returns.length} returnsTotal={p.returnsTotal} netTotal={p.netTotal} />
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{p.netTotal < 0 ? 'Amount Refunded to Customer' : 'Amount Received from Customer'}</label>
              <input type="number" min="0" value={p.bulkReceivedAmount} onKeyDown={e => numericKeyDown(e)} onChange={e => p.setBulkReceivedAmount(e.target.value)} placeholder={String(Math.abs(p.netTotal))} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              {(() => { const recv = Number(p.bulkReceivedAmount) || 0; const expected = Math.abs(p.netTotal); const diff = recv - expected; if (!p.bulkReceivedAmount || diff === 0) return null; return <div style={{ marginTop: 4, fontSize: 10, color: T.yl, fontWeight: 600 }}>₹{Math.abs(diff).toLocaleString('en-IN')} {diff > 0 ? 'more than expected' : 'less than expected'}</div>; })()}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{p.netTotal < 0 ? 'Refund Mode' : 'Payment Mode'}</label>
              <select value={p.bulkPayMode} onChange={e => p.setBulkPayMode(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '8px 10px', outline: 'none' }}>
                <option value="">Select...</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={p.onCloseBulkPay} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={p.onConfirmBulkPay} disabled={!p.bulkPayMode || p.payable.length === 0 || p.bulkBusy} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', background: p.bulkPayMode ? `linear-gradient(135deg, ${p.netTotal < 0 ? T.re : T.gr}, ${p.netTotal < 0 ? T.reCC : T.grCC})` : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: p.bulkPayMode && !p.bulkBusy ? 'pointer' : 'default', opacity: p.bulkPayMode && !p.bulkBusy ? 1 : 0.4 }}>{p.bulkBusy ? 'Processing…' : p.netTotal < 0 ? 'Settle & Refund' : 'Confirm Pay'}</button>
            </div>
          </div>
        </div>
      )}

      {p.showBulkUnpay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }} onClick={p.onCloseBulkUnpay}>
          <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Bulk Unpay</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>This will revert <strong style={{ color: T.yl }}>{p.unpayable.length}</strong> challan{p.unpayable.length !== 1 ? 's' : ''} to unpaid and clear their payment info. Returns cannot be unpaid.</div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 6, maxHeight: 160, overflowY: 'auto', marginBottom: 14 }}>
              {p.unpayable.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 10 }}>
                  <span style={{ color: T.tx }}>#{c.challan_number} · {c.customer_name}</span>
                  <span style={{ fontFamily: T.mono, color: T.tx2 }}>₹{Number(c.total).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={p.onCloseBulkUnpay} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={p.onConfirmBulkUnpay} disabled={p.bulkBusy} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.yl}, ${T.ylCC})`, color: '#fff', fontSize: 11, fontWeight: 600, cursor: p.bulkBusy ? 'default' : 'pointer', opacity: p.bulkBusy ? 0.5 : 1 }}>{p.bulkBusy ? 'Processing…' : 'Confirm Unpay'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
