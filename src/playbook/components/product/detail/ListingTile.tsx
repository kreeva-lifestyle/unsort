// One website's listing on the product page (V2 bento tile, no blur): name,
// status dot + label, mono price (and was-price), the AI title, the error,
// then Edit (opens the listing editor, where Approve / Publish live, so the
// full text is seen before it goes out) and the Shopify link.
// Tinted when it needs action: review → review tile, failed → failed tile.
import type { CSSProperties } from 'react';
import { shopifyAdminUrl } from '../../../data/pbFunctions';
import type { ListingFull, WebsiteLite } from '../../../data/products';
import { PB, pbBtnSecondary, pbMeta, pbName, pbNum } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbIcon from '../../ui/PbIcon';
import PbTile, { type PbSpan } from '../../ui/PbTile';
import { Dot, LISTING_STATUS, rupees } from '../status';

const clamp = (lines: number): CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' });

export default function ListingTile({ l, site, span, busy, primary, onEdit, stretch }: {
  l: ListingFull; site: WebsiteLite | undefined; span: PbSpan; busy: string | null;
  /** This tile's Edit (a listing waiting for approval) is the page's one gradient button. */
  primary: boolean; onEdit: () => void;
  /** Phone: the buttons share the row's width. */
  stretch?: boolean;
}) {
  const st = LISTING_STATUS[l.status];
  const name = site?.name ?? 'Website';
  const admin = site ? shopifyAdminUrl(site.shop_domain, l.shopify_product_id) : null;
  const headId = `pb-lt-${l.id}`;
  const btn = (key: string) => ({ busy: busy === key, dim: !!busy && busy !== key, style: { flex: stretch ? '1 1 auto' : '0 1 auto' } });

  return (
    <PbTile as="article" flat variant={st.tint ?? 'default'} span={span} aria-labelledby={headId}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h3 id={headId} style={{ ...pbName, margin: 0, overflowWrap: 'anywhere' }}>{name}</h3>
          <Dot color={st.color} label={st.label} />
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '50%' }}>
          {l.price == null ? <div style={{ ...pbMeta, paddingTop: 2 }}>No price yet</div> : (
            <div style={{ ...pbNum, fontSize: 20, fontWeight: 500, lineHeight: 1.2, color: PB.tx, overflowWrap: 'anywhere' }}>{rupees(l.price)}</div>
          )}
          {l.compare_at_price != null && (
            <div style={{ ...pbNum, fontSize: 12, color: PB.tx2 }}><s><span className="pb-sr">Was </span>{rupees(l.compare_at_price)}</s></div>
          )}
        </div>
      </div>
      <div style={{ ...pbMeta, ...clamp(2), color: l.title ? PB.tx : PB.tx2 }}>{l.title || 'Not written yet'}</div>
      {/* The error is the thing to act on, so it is never clamped (a title= tooltip never shows on a phone). */}
      {l.error && <div style={{ fontSize: 13, lineHeight: 1.5, color: PB.failed, overflowWrap: 'anywhere' }}>{l.error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        <PbButton kind={primary ? 'primary' : 'secondary'} icon="edit" {...btn(`edit:${l.id}`)} onClick={onEdit} aria-label={`Edit the listing on ${name}`}>Edit</PbButton>
        {admin && (
          <a href={admin} target="_blank" rel="noreferrer" className="pb-pill" aria-label={`Open on Shopify (${name})`}
            style={{ ...pbBtnSecondary, flex: stretch ? '1 1 auto' : '0 1 auto', ...(busy ? { opacity: 0.5, pointerEvents: 'none' } : null) }}>
            Open on Shopify <PbIcon name="arrowUpRight" size={16} />
          </a>
        )}
      </div>
    </PbTile>
  );
}
