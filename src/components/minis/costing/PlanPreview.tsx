// Full-screen purchase-plan preview (house iframe pattern, no window.open)
// with Print / Save-as-PDF. The EDITOR validates the sheet and the piece
// count before opening this — by the time we render, both are good.
import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { CostingProduct } from './costingModel';
import { purchasePlanHtml } from './purchasePlan';

export default function PlanPreview({ product, pieces, onClose }: {
  product: CostingProduct;
  pieces: number;
  onClose: () => void;
}) {
  const html = useMemo(
    () => purchasePlanHtml(product.sku, product.image_url, product.components, pieces, product.maintenance_pct),
    [product, pieces],
  );

  const print = () => {
    const frame = document.getElementById('costing-plan-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  };

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
