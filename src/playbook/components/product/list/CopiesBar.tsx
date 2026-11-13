// Products → Needs info and → Waiting as copies: "N products are waiting as
// copies of products you already have", with "Show only these" (on the copies
// view: "Show all of Needs info") and "Archive the copies" (pre-launch fix
// D18: a vendor's repeats piled up among the incomplete products and had to
// be answered one tap each).
// The number is one cheap count of the notes the Ready gate keeps (asked on
// every list load). Archiving asks first, with every copy judged as things
// stand right then (pb_copies_archive, apply = false — only on the tap): copies
// with nothing of their own are archived; one that is already on a website,
// that came with a price the earlier product lacks or contradicts, or that is
// tied to another waiting copy, is left to be opened. It is a bulk change, so
// Settings → Bulk changes takes it back for 7 days. Two signals: "Checking…" /
// "Archiving…" on the button, then a toast. Hidden when no product waits as a copy.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { logSwallowed } from '../../../../lib/errorLogger';
import { useConfirm } from '../../../../components/ui/ConfirmModal';
import type { AddToast } from '../../PbToasts';
import { archiveCopies, countCopies, leftOver, previewCopies, type CopyCounts } from '../../../data/copies';
import { count } from '../../../format';
import { PB, pbNum } from '../../../pbTheme';
import { PbButton, PbConfirm, PbTile } from '../../ui';
import { Dot } from '../status';

const copies = (k: number) => `${count(k)} ${k === 1 ? 'copy' : 'copies'}`;
/** "2 came with a different price, 1 is already on a website" — the copies left for a person. */
export function leftText(c: Pick<CopyCounts, 'priced' | 'on_site' | 'linked'>): string {
  return [
    c.priced ? `${count(c.priced)} came with a different price` : '',
    c.on_site ? `${count(c.on_site)} ${c.on_site === 1 ? 'is' : 'are'} already on a website` : '',
    c.linked ? `${count(c.linked)} ${c.linked === 1 ? 'is' : 'are'} tied to another waiting copy` : '',
  ].filter(Boolean).join(', ');
}

export default function CopiesBar({ only, reload, addToast, onShow, onDone }: {
  /** The list shows only the copies: the first button leads back to all of Needs info instead. */
  only: boolean;
  /** Changes when the list was loaded again: the count follows. */
  reload?: unknown;
  addToast: AddToast; onShow: () => void; onDone: () => void;
}) {
  const [n, setN] = useState<number | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'archive'>('');
  const { ask, modalProps } = useConfirm();
  useEffect(() => {
    let live = true;
    countCopies().then(c => { if (live) setN(c); }).catch(e => logSwallowed('count copies', e));
    return () => { live = false; };
  }, [reload]);
  if (!n) return null;

  const go = async () => {
    if (busy) return;
    setBusy('check');
    try {
      const p = await previewCopies();
      const left = leftText(p);
      setN(p.archived + leftOver(p));
      if (!p.archived) {
        // Nothing left at all: the notes that brought the bar up no longer hold. The server clears them (once).
        if (!left) await archiveCopies();
        addToast(left ? `None can be archived together: ${left}. Open them one by one.` : 'No product is waiting as a copy any more', 'info');
        if (!left) onDone();
        return;
      }
      const ok = await ask({
        title: `Archive ${copies(p.archived)}?`,
        message: `${p.archived === 1 ? 'It moves' : 'They move'} to Archived. Nothing is deleted and nothing changes on your websites. You can take this back for 7 days in Settings → Bulk changes.${left ? ` Left for you to open: ${left}.` : ''}`,
        confirmLabel: `Archive ${copies(p.archived)}`,
      });
      if (!ok) return;
      setBusy('archive');
      const r = await archiveCopies();
      const rest = leftText(r);
      addToast(r.archived ? `${copies(r.archived)} archived${rest ? ` · left to open: ${rest}` : ''}. Settings → Bulk changes takes it back` : 'Nothing was left to archive', 'success');
      setN(leftOver(r));
      onDone();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <PbTile variant="review" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <Dot color={PB.review} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal', flex: '1 1 220px' }}
        label={<span><span style={pbNum}>{count(n)}</span> {n === 1 ? 'product is waiting as a copy of a product' : 'products are waiting as copies of products'} you already have. Open one to answer it, or archive the copies together.</span>} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: '100%' }}>
        <PbButton style={{ whiteSpace: 'normal', padding: '8px 16px', flex: '1 1 auto' }} onClick={onShow} dim={!!busy}>{only ? 'Show all of Needs info' : 'Show only these'}</PbButton>
        <PbButton icon="copy" style={{ whiteSpace: 'normal', padding: '8px 16px', flex: '1 1 auto' }} onClick={() => void go()} busy={!!busy} busyLabel={busy === 'archive' ? 'Archiving…' : 'Checking…'}>Archive the copies</PbButton>
      </div>
      <PbConfirm {...modalProps} />
    </PbTile>
  );
}
