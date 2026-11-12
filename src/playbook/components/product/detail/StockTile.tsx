// Product page: In stock / Out of stock (owner, 2026-11-12: "If stock
// out/in-stock on playbook that same happens in shopify stores"). One switch,
// saved at once (no Save button): the server sends the listings already on
// Shopify again, so they show Sold out, or can be ordered again, within a few
// minutes. A product copied from a website gets this from that
// store on every import, so the hint says who decides next time.
// Two signals: "Saving…" beside the switch, then a toast.
// A vendor's TEMPORARY stock-out notice leaves only a note here (owner,
// 2026-11-12: "just note that product as temporary … nothing is to be done"):
// a line with the date and "Clear note"; the product stays on sale.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import type { AddToast } from '../../PbToasts';
import type { ProductDetail } from '../../../data/products';
import { clearTempOut, setStock } from '../../../data/stock';
import { PB, pbMeta, pbTileTitle } from '../../../pbTheme';
import { PbButton, PbTile } from '../../ui';
import PbSwitch from '../../ui/PbSwitch';
import { Dot, NEUTRAL, shortDate } from '../status';

export default function StockTile({ p, span, addToast, onChanged }: { p: Pick<ProductDetail, 'id' | 'in_stock' | 'temp_out_at' | 'source' | 'source_ref'>; span?: 12; addToast: AddToast; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const on = p.in_stock !== false;
  const clear = async () => {
    setClearing(true);
    try { await clearTempOut(p.id); addToast('Note cleared', 'success'); onChanged(); }
    catch (e) { addToast(friendlyError(e), 'error'); } finally { setClearing(false); }
  };
  const host = p.source === 'import' ? (p.source_ref || '').split(':')[0] : '';
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setStock(p.id, !on);
      const sent = r.resent ? ` — ${r.resent} listing${r.resent === 1 ? '' : 's'} on Shopify will ${on ? 'show Sold out' : 'be orderable again'} within a few minutes` : '';
      addToast(`${on ? 'Marked out of stock' : 'Back in stock'}${sent}`, 'success');
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <PbTile as="section" span={span} aria-labelledby="pb-stock-title" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id="pb-stock-title" style={pbTileTitle}>Stock</h2>
        <span style={pbMeta}>
          {on ? 'Shoppers can order it on every website it is listed on.' : 'Shown as Sold out on every website it is listed on.'}
          {host && ` The next import from ${host} sets this from that store again.`}
        </span>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
        <Dot color={on ? PB.live : NEUTRAL} label={busy ? 'Saving…' : on ? 'In stock' : 'Out of stock'} />
        <PbSwitch on={on} onToggle={() => void flip()} label="In stock" />
      </span>
      {p.temp_out_at && (
        <div style={{ flex: '1 1 100%', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <Dot color={PB.review} style={{ whiteSpace: 'normal', flex: '1 1 220px', minWidth: 0 }}
            label={`The vendor said this is temporarily out of stock (${shortDate(p.temp_out_at)}). Nothing was changed on your websites.`} />
          <PbButton onClick={() => void clear()} busy={clearing} busyLabel="Clearing…" dim={busy}>Clear note</PbButton>
        </div>
      )}
    </PbTile>
  );
}
