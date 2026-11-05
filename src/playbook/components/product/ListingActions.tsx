// Buttons under the listing editor. Unsaved edits are saved first, so an
// action never runs on stale text. Each button shows "…ing" while it works.
// V2: one gradient per view (Save when edited, else the status's main step).
// The editor renders this twice: part="primary" in the sheet footer (always in
// view, full width on phone) and part="rest" in the body — the other steps,
// then "Remove from site" on its own row, away from the primary.
import { useConfirm } from '../../../components/ui/ConfirmModal';
import PbConfirm from '../ui/PbConfirm';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import { pbCall } from '../../data/pbFunctions';
import { getListing, type ListingFull } from '../../data/listings';
import { PB } from '../../pbTheme';
import PbButton from '../ui/PbButton';
import { useIsPhone } from '../../hooks/useIsPhone';
import { approveCall, approveDone, canPublish, isRemoved, onShopify as onShopifyOf, publishBusy, publishCall, publishDone, publishLabel } from './detail/listingCalls';

type Props = {
  part: 'primary' | 'rest';
  listing: ListingFull; dirty: boolean; busy: string | null; setBusy: (b: string | null) => void;
  save: () => Promise<boolean>; onSave: () => void; onUpdated: (l: ListingFull) => void; addToast: AddToast;
};

/** Which button is the gradient: Save when edited; else Approve (review), Publish, or "Put back on site" (regen when removed). */
export function listingPrimary(l: ListingFull, dirty: boolean): 'save' | 'approve' | 'publish' | 'regen' | null {
  const removed = isRemoved(l);
  const regen = l.status !== 'generating' && (!removed || !l.generated_at);
  return dirty ? 'save' : l.status === 'review' ? 'approve' : canPublish(l) ? 'publish' : regen && removed ? 'regen' : null;
}

export default function ListingActions({ part, listing: l, dirty, busy, setBusy, save, onSave, onUpdated, addToast }: Props) {
  const { ask, modalProps } = useConfirm();
  const phone = useIsPhone();
  const onShopify = onShopifyOf(l);
  const working = l.status === 'generating';
  const removed = isRemoved(l);
  // Removed after it was written → "Put back on site" publishes it again. Removed (or skipped by
  // routing / archive) before it was ever written → writing it is how it comes back (generate_listing).
  const written = !!l.generated_at;

  const run = async (key: string, fn: () => Promise<unknown>, done: string | ((r: unknown) => string)) => {
    if (busy) return;
    setBusy(key);
    try {
      if (!(await save())) return;
      const r = await fn();
      onUpdated(await getListing(l.id));
      addToast(typeof done === 'function' ? done(r) : done, 'success');
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

  const review = l.status === 'review';
  const publish = canPublish(l);
  const regen = !working && (!removed || !written);
  const primary = listingPrimary(l, dirty);
  // Each button shows in exactly one part: the primary in the footer, the rest in the body.
  const here = (key: string) => (part === 'primary') === (primary === key);
  const props = (key: string) => ({
    kind: primary === key ? 'primary' as const : 'secondary' as const,
    busy: busy === key, dim: !!busy && busy !== key,
    style: { flex: part === 'rest' || phone ? '1 1 160px' : '0 1 auto' },
  });

  if (part === 'primary') return primary ? <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{buttons()}</div> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{buttons()}</div>
      {!removed && (
        <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, display: 'flex' }}>
          <PbButton kind="danger" icon="trash" busy={busy === 'remove'} dim={!!busy && busy !== 'remove'} busyLabel="Removing…" onClick={remove}>Remove from site</PbButton>
        </div>
      )}
      <PbConfirm {...modalProps} />
    </div>
  );

  function buttons() {
    return (
      <>
        {dirty && here('save') && <PbButton {...props('save')} onClick={onSave} busyLabel="Saving…">Save changes</PbButton>}
        {review && here('approve') && (
          <PbButton {...props('approve')} busyLabel="Approving…" onClick={() => run('approve', approveCall(l), approveDone)}>Approve</PbButton>
        )}
        {publish && here('publish') && (
          <PbButton {...props('publish')} busyLabel={publishBusy(l)} onClick={() => run('publish', publishCall(l), publishDone(l))}>{publishLabel(l)}</PbButton>
        )}
        {regen && here('regen') && (
          <PbButton {...props('regen')} busyLabel="Writing…"
            onClick={() => run('regen', () => pbCall('generate_listing', { listing_id: l.id }), removed ? 'Written — it goes back on the website' : 'Written again — your edited fields were kept')}>
            {removed ? 'Put back on site' : 'Regenerate'}
          </PbButton>
        )}
      </>
    );
  }
}
