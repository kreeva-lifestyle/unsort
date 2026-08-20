// "How much to buy for N pcs" — asks for the piece count, then shows the
// purchase plan in the house full-screen iframe preview (no window.open) with
// Print / Save-as-PDF via the browser's print dialog. The sheet must pass the
// same compulsory-field validation as Save: a plan from a half-filled sheet
// would order the wrong quantities.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingProduct, validateSheet, num } from './costingModel';
import { purchasePlanHtml } from './purchasePlan';

export default function PlanPreview({ product, addToast, onClose }: {
  product: CostingProduct;
  addToast: (m: string, t?: string) => void;
  onClose: () => void;
}) {
  const [pieces, setPieces] = useState('');
  const [html, setHtml] = useState<string | null>(null);

  const generate = () => {
    const n = Math.floor(num(pieces));
    if (!(n > 0)) { addToast('Enter how many pieces to make', 'error'); return; }
    const errs = validateSheet(product.sku, product.components);
    if (errs.length) { addToast(`Fix the sheet first — ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`, 'error'); return; }
    setHtml(purchasePlanHtml(product.sku, product.image_url, product.components, n, product.maintenance_pct));
  };

  const print = () => {
    const frame = document.getElementById('costing-plan-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  };

  if (html) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#060810', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottom: `1px solid ${T.bd}` }}>
          <div style={{ fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.tx }}>Purchase plan — {product.sku} × {pieces} pcs</div>
        </div>
        <iframe id="costing-plan-frame" title="Purchase plan preview" srcDoc={html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.bd}` }}>
          <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, maxWidth: 200, minHeight: 44 }}>Close</button>
          <button onClick={print} style={{ ...S.btnPrimary, flex: 1, maxWidth: 200, minHeight: 44 }}>Print / Save PDF</button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 360 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Purchase plan</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <label style={S.fLabel}>How many pieces to make?</label>
          <input value={pieces} onChange={e => setPieces(e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') generate(); }}
            type="number" inputMode="numeric" placeholder="e.g. 48" autoFocus style={{ ...S.fInput, width: '100%' }} />
          <div style={{ fontSize: 10.5, color: T.tx3, marginTop: 6, lineHeight: 1.5 }}>
            You&rsquo;ll get a printable list of every material to buy — quantities, suppliers, material codes and cost — for that many pieces.
          </div>
          <button onClick={generate} style={{ ...S.btnPrimary, width: '100%', minHeight: 44, marginTop: 12 }}>Generate plan</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
