// "This design" in the pipeline panel: the SKU's photos and the POs / job work
// raised for it that are not on the canvas yet, each one tap from being added
// (into an empty step of its kind, or a new step joined like its neighbour).
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import SkuPhotos from './SkuPhotos';
import SkuOrders from './SkuOrders';
import { useSkuFinds, forget, orderLabel, type SkuOrder } from './skuFinds';
import { linkOrders } from './autoLink';

export default function SkuPanel({ pipelineId, sku, linkedIds, onLinked, addToast }: {
  pipelineId: string;
  sku: string | null;
  linkedIds: Set<string>;
  onLinked: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [bump, setBump] = useState(0);
  const { real, key, finds, error } = useSkuFinds(sku, bump);
  const [adding, setAdding] = useState<string | null>(null);
  if (!sku) return <span style={{ fontSize: 11, color: T.tx3 }}>Add the SKU above and its photos, POs and job work show here.</span>;
  if (!real) return <span style={{ fontSize: 11, color: T.yl }}>"{sku}" is not a design in the catalog, so nothing can be matched to it.</span>;

  const add = async (o: SkuOrder) => {
    if (adding) return;
    setAdding(o.id);
    try {
      const r = await linkOrders(pipelineId, [o]);
      if (r.failed) addToast(friendlyError(r.failed), 'error');
      else addToast(`${orderLabel(o)} added to the canvas`, 'success');
      onLinked();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setAdding(null); }
  };
  const refresh = () => { forget(key); setBump(b => b + 1); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 10 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...S.fLabel, marginBottom: 0 }}>This design · {key}</span>
        <button type="button" onClick={refresh} style={{ ...S.btnSm, minHeight: 28, border: `1px solid ${T.bd2}`, background: T.glass1, color: T.tx3, cursor: 'pointer', fontFamily: T.sans }}>Refresh</button>
      </span>
      <SkuPhotos sku={key} costingImage={finds?.image ?? null} height={60} />
      <SkuOrders mode="add" sku={key} orders={finds ? finds.orders.filter(o => !linkedIds.has(o.id)) : null} error={error} adding={adding} onAdd={add} />
    </div>
  );
}
