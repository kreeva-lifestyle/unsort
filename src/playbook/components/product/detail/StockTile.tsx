// Product page: In stock / Out of stock (owner, 2026-11-12: "If stock
// out/in-stock on playbook that same happens in shopify stores"). One switch,
// saved at once (no Save button): the server sends just the stock to every
// store that has the product, at once (stockSend.ts). `owed` = the stores it
// has not reached yet (tried again every 5 minutes): the tile says so instead
// of claiming it is done. Stock is never taken from a source website (owner, 2026-11-12:
// "What if source website stopped doing business"): it changes here, or by a
// vendor's stock-out notice.
// Two signals: "Saving…" beside the switch, then a toast.
// A vendor's TEMPORARY stock-out notice leaves only a note here (owner,
// 2026-11-12: "just note that product as temporary … nothing is to be done"):
// a line with the date and "Clear note"; the product stays on sale. A
// PERMANENT one ("Archive it") shows its own line: the product was archived
// and taken off the websites; switching Stock on ends that.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import type { AddToast } from '../../PbToasts';
import type { ProductDetail } from '../../../data/products';
import { clearTempOut, setStock } from '../../../data/stock';
import { PB, pbMeta, pbTileTitle } from '../../../pbTheme';
import { PbButton, PbTile } from '../../ui';
import PbSwitch from '../../ui/PbSwitch';
import { Dot, NEUTRAL, shortDate } from '../status';

export default function StockTile({ p, owed = 0, span, addToast, onChanged }: { p: Pick<ProductDetail, 'id' | 'in_stock' | 'temp_out_at' | 'perm_out_at'>; owed?: number; span?: 12; addToast: AddToast; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const on = p.in_stock !== false;
  const clear = async () => {
    setClearing(true);
    try { await clearTempOut(p.id); addToast('Note cleared', 'success'); onChanged(); }
    catch (e) { addToast(friendlyError(e), 'error'); } finally { setClearing(false); }
  };
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setStock(p.id, !on);
      const sites = (n: number) => (n === 1 ? '1 website' : `${n} websites`);
      const sent = r.resent ? ` — sent to ${sites(r.resent)}` : '';
      const wait = r.waiting ? `${sent ? ';' : ' —'} ${sites(r.waiting)} could not be reached yet, Playbook keeps trying` : '';
      addToast(`${on ? 'Marked out of stock' : 'Back in stock'}${sent}${wait}`, 'success');
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <PbTile as="section" span={span} aria-labelledby="pb-stock-title" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id="pb-stock-title" style={pbTileTitle}>Stock</h2>
        <span style={pbMeta}>
          {on ? 'Shoppers can order it on every website it is listed on.' : p.perm_out_at ? (owed ? 'Being taken off the websites it is listed on.' : 'Taken off every website it was listed on.') : 'Shown as Sold out on every website it is listed on.'}
        </span>
        {owed > 0 && <Dot color={PB.review} style={{ whiteSpace: 'normal' }} label={`Not on ${owed === 1 ? '1 website' : `${owed} websites`} yet. Playbook sends it within a minute, and tries again every 5 minutes while a store cannot be reached.`} />}
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
        <Dot color={on ? PB.live : NEUTRAL} label={busy ? 'Saving…' : on ? 'In stock' : 'Out of stock'} />
        <PbSwitch on={on} onToggle={() => void flip()} label="In stock" />
      </span>
      {!on && p.perm_out_at && (
        <Dot color={NEUTRAL} style={{ whiteSpace: 'normal', flex: '1 1 100%', minWidth: 0 }}
          label={`The vendor said permanent stock out (${shortDate(p.perm_out_at)}). It ${owed ? 'is being taken off your websites and archived' : 'was archived and taken off your websites'}. Switch Stock on to sell it again.`} />
      )}
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
