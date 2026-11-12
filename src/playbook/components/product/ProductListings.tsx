// Where this product is listed: one bento tile per website (status, price,
// title, error, AI cost, Shopify link), under what the AI cost for the product
// in all. Edit opens the listing editor.
// Spans keep every row full at 12 and 6 columns: pairs of 6, an odd last one 12.
import { useState } from 'react';
import type { AddToast } from '../PbToasts';
import type { ListingFull, WebsiteLite } from '../../data/products';
import { PB, pbBody, pbMeta, pbNum, pbTileTitle } from '../../pbTheme';
import PbTile, { type PbSpan } from '../ui/PbTile';
import ListingEditor from './ListingEditor';
import ListingTile from './detail/ListingTile';
import AiCostLine from './detail/AiCostLine';
import type { PbAiCost } from '../../seoTypes';

const spanOf = (i: number, n: number): PbSpan => (n === 1 || (n % 2 === 1 && i === n - 1) ? 12 : 6);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ProductListings({ listings, sites, onChanged, addToast, busy = null, primary = false, phone = false, cost = null }: {
  listings: ListingFull[]; sites: WebsiteLite[]; onChanged: () => void; addToast: AddToast;
  /** What the AI cost for this product so far (reading, tags and every website's writing). */
  cost?: PbAiCost | null;
  /** The page's one busy key (dims the tile buttons while a page action runs). */
  busy?: string | null;
  /** The first waiting listing's Edit is the page's gradient button. */
  primary?: boolean;
  /** Phone layout: tile buttons share the row. */
  phone?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = listings.find(l => l.id === openId);
  const site = (id: string) => sites.find(s => s.id === id);
  const notOn = sites.filter(s => s.active && !listings.some(l => l.website_id === s.id));
  const live = listings.filter(l => l.status === 'published').length;
  const failed = listings.filter(l => l.status === 'failed').length;
  const waiting = listings.filter(l => l.status === 'review').length;
  const firstReview = listings.find(l => l.status === 'review')?.id;

  return (
    <section aria-labelledby="pb-listings-title" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 12px', flexWrap: 'wrap', padding: '0 4px' }}>
        <h2 id="pb-listings-title" style={pbTileTitle}>Websites</h2>
        {listings.length > 0 && (
          <span style={pbMeta}>
            Published to <span style={pbNum}>{live}</span> of {plural(listings.length, 'website', 'websites')}
            {waiting > 0 && <> · <span style={pbNum}>{waiting}</span> waiting for approval</>}
            {failed > 0 && <> · <span style={pbNum}>{failed}</span> failed</>}
          </span>
        )}
      </div>
      <AiCostLine cost={cost} />
      <div className="pb-bento pb-bento--auto">
        {listings.length === 0 && (
          <PbTile span={12} style={{ ...pbBody, color: PB.tx2 }}>
            Not listed anywhere yet. Once the product is Ready, each website's rules decide whether it goes there.
          </PbTile>
        )}
        {listings.map((l, i) => (
          <ListingTile key={l.id} l={l} site={site(l.website_id)} span={spanOf(i, listings.length)} busy={busy}
            primary={primary && l.id === firstReview} onEdit={() => setOpenId(l.id)} stretch={phone} />
        ))}
      </div>
      {notOn.length > 0 && listings.length > 0 && (
        <div style={{ ...pbMeta, padding: '0 4px', overflowWrap: 'anywhere' }}>Not on: {notOn.map(s => s.name).join(', ')}</div>
      )}
      {open && <ListingEditor key={open.id} listing={open} site={site(open.website_id)} onClose={() => setOpenId(null)} onChanged={onChanged} addToast={addToast} />}
    </section>
  );
}
