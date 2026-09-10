// Full-screen "Pending orders" report for one vendor — pick the vendor
// (only vendors with open orders are listed, longest wait first), preview
// the A4 document, then Print or Share the image. Rates hidden by default,
// the same rule as the shared PO. Mirrors the PO print overlay.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { printOrQueue } from '../../lib/printQueue';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import Toggle from '../ui/Toggle';
import { fetchPendingVendors, fetchVendorPendency, type PendencyReport as Report, type PendingVendor } from './pendencyData';
import { buildPendencyHtml, fmtDate, waitText } from './pendencyDoc';
import { sharePendencyImage } from './pendencyImage';

export default function PendencyReport({ vendor: initial, onClose, addToast }: {
  /** Preselected vendor (from a PO's detail); otherwise the longest-waiting vendor. */
  vendor?: string | null;
  onClose: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [vendors, setVendors] = useState<PendingVendor[] | null>(null);
  const [vendor, setVendor] = useState(initial || '');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState(false);
  const [sharing, setSharing] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useModalLock(true);
  useBackClose(true, onClose);

  useEffect(() => {
    let alive = true;
    fetchPendingVendors()
      .then(v => { if (!alive) return; setVendors(v); setVendor(cur => cur || v[0]?.name || ''); })
      .catch(e => { if (alive) { addToast(friendlyError(e), 'error'); setVendors([]); } });
    return () => { alive = false; };
  }, [addToast]);

  useEffect(() => {
    if (!vendor) { setReport(null); return; }
    let alive = true;
    setLoading(true);
    fetchVendorPendency(vendor)
      .then(r => { if (alive) setReport(r); })
      .catch(e => { if (alive) addToast(friendlyError(e), 'error'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [vendor, addToast]);

  const html = report ? buildPendencyHtml(report, { rates }) : '';
  const listed = vendors && vendor && !vendors.some(v => v.name === vendor);
  const btn = { padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1, maxWidth: 130 } as const;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
      <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora, whiteSpace: 'nowrap' }}>Pending orders</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: rates ? T.yl : T.tx3, marginLeft: 'auto' }}>
          {rates ? 'Rates shown' : 'Rates hidden'}
          <Toggle size="sm" on={rates} label="Show rates" onToggle={() => setRates(r => !r)} />
        </label>
        <button onClick={onClose} className="touch44" aria-label="Close" style={{ background: 'none', border: 'none', color: T.tx3, fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>&#215;</button>
      </div>

      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.bd}`, background: T.s, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={S.fLabel}>Vendor</label>
          <select value={vendor} onChange={e => setVendor(e.target.value)} aria-label="Vendor" disabled={!vendors} style={{ ...S.fInput, width: '100%', cursor: 'pointer' }}>
            {!vendors && <option value="">Loading vendors…</option>}
            {vendors && vendors.length === 0 && !vendor && <option value="">No vendor has a pending order</option>}
            {listed && <option value={vendor}>{vendor}</option>}
            {vendors?.map(v => <option key={v.name} value={v.name}>{v.name} — {v.orders} open{v.oldestSince ? ` · since ${fmtDate(v.oldestSince)}` : ''}</option>)}
          </select>
        </div>
        {report && report.totals.orders > 0 && (
          <div style={{ fontSize: 11, color: report.totals.oldestDays > 14 ? T.re : report.totals.oldestDays > 7 ? T.yl : T.tx2, fontFamily: T.mono, paddingTop: 16 }}>
            {report.totals.orders} open · oldest since {fmtDate(report.totals.oldestSince)} ({waitText(report.totals.oldestDays)})
          </div>
        )}
      </div>

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.tx3, fontSize: 12 }}>Loading pending orders…</div>}
      {!loading && !report && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.tx3, fontSize: 12, padding: 30, textAlign: 'center' }}>{vendors && vendors.length === 0 ? 'No vendor has a pending order right now. Drafts are not counted — only approved, sent and partly received orders.' : 'Pick a vendor to build the report.'}</div>}
      {!loading && report && <iframe ref={frameRef} srcDoc={html} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} title="Pending orders preview" />}

      <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)' }}>
        <button onClick={onClose} style={{ ...btn, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx2 }}>Close</button>
        <button onClick={() => report && printOrQueue('document', html, 'A4', 'Pending Orders', undefined, addToast, frameRef.current)} disabled={!report}
          style={{ ...btn, border: `1px solid ${T.ac3}`, background: T.ac3, color: T.ac2, opacity: report ? 1 : 0.4, pointerEvents: report ? 'auto' : 'none' }}>Print</button>
        <button onClick={() => { if (!report || sharing) return; setSharing(true); sharePendencyImage(report, addToast, { rates }).finally(() => setSharing(false)); }} disabled={!report}
          style={{ ...btn, border: 'none', ...S.btnPrimary, fontSize: 13, opacity: report && !sharing ? 1 : 0.5, pointerEvents: report && !sharing ? 'auto' : 'none' }}>{sharing ? 'Sharing…' : 'Share'}</button>
      </div>
    </div>,
    document.body,
  );
}
