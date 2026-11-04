// Buttons under the listing editor. Unsaved edits are saved first, so an
// action never runs on stale text. Each button shows "…ing" while it works.
import type { CSSProperties } from 'react';
import ConfirmModal, { useConfirm } from '../../../components/ui/ConfirmModal';
import { S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import { pbCall } from '../../data/pbFunctions';
import { approveListing, getListing, type ListingFull } from '../../data/listings';

type Props = {
  listing: ListingFull; dirty: boolean; busy: string | null; setBusy: (b: string | null) => void;
  save: () => Promise<boolean>; onSave: () => void; onUpdated: (l: ListingFull) => void; addToast: AddToast;
};

export default function ListingActions({ listing: l, dirty, busy, setBusy, save, onSave, onUpdated, addToast }: Props) {
  const { ask, modalProps } = useConfirm();
  const onShopify = !!l.shopify_product_id;
  const working = l.status === 'generating';
  const removed = l.status === 'skipped'; // only "Put back on site" brings it back (the server refuses Regenerate)

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(key);
    try {
      if (!(await save())) return;
      await fn();
      onUpdated(await getListing(l.id));
      addToast(done, 'success');
    } catch (e) {
      addToast(friendlyError(e), 'error');
      // The server may have recorded the error on the listing — show it.
      try { onUpdated(await getListing(l.id)); } catch { /* the toast above already told the user */ }
    } finally { setBusy(null); }
  };

  const remove = async () => {
    const ok = await ask({
      title: 'Remove from this website?', danger: true, confirmLabel: 'Remove',
      message: onShopify ? 'The product is set to Draft on Shopify (hidden from shoppers, not deleted). It will not be re-listed on its own.' : 'It will not be listed on this website.',
    });
    if (ok) await run('remove', () => pbCall('unpublish_listing', { listing_id: l.id }), 'Removed from the website');
  };

  const btn = (style: CSSProperties): CSSProperties => ({
    ...style, minHeight: 44, flex: '1 1 140px', opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto',
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {dirty && <button type="button" onClick={onSave} style={btn(S.btnPrimary)}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>}
      {l.status === 'review' && (
        <button type="button" onClick={() => run('approve', () => approveListing(l), 'Approved — it will publish within a minute')} style={btn(S.btnSuccessSolid)}>
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
      )}
      {(['review', 'failed', 'published', 'publishing'].includes(l.status) || (removed && !!l.generated_at)) && (
        <button type="button" onClick={() => run('publish', () => pbCall('publish_listing', { listing_id: l.id }), removed ? 'Back on the website' : onShopify ? 'Updated on Shopify' : 'Published to Shopify')}
          style={btn(l.status === 'review' ? S.btnGhost : S.btnPrimary)}>
          {busy === 'publish' ? (onShopify ? 'Updating…' : 'Publishing…') : removed ? 'Put back on site' : onShopify ? 'Update on Shopify' : 'Publish now'}
        </button>
      )}
      {!working && !removed && (
        <button type="button" onClick={() => run('regen', () => pbCall('generate_listing', { listing_id: l.id }), 'Written again — your edited fields were kept')} style={btn(S.btnGhost)}>
          {busy === 'regen' ? 'Writing…' : 'Regenerate'}
        </button>
      )}
      {!removed && (
        <button type="button" onClick={remove} style={btn(S.btnDanger)}>{busy === 'remove' ? 'Removing…' : 'Remove from site'}</button>
      )}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
