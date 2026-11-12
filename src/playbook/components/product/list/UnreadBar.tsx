// Products → Needs info: "N products could not be read by the AI" with "Read
// all N again" — each goes back in the queue (reread_failed) and the
// automation reads it again. For after an AI outage or a fixed photo: without
// it every product had to be opened and read again one by one. Two signals:
// "Queuing…" on the button, then a toast. Hidden when there are none.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { logSwallowed } from '../../../../lib/errorLogger';
import type { AddToast } from '../../PbToasts';
import { rereadFailed, unreadCount } from '../../../data/unread';
import { PB, pbNum } from '../../../pbTheme';
import { PbButton, PbTile } from '../../ui';
import { Dot } from '../status';

export default function UnreadBar({ addToast, onQueued, count: given }: { addToast: AddToast; onQueued: () => void; count?: number }) {
  const [n, setN] = useState<number | null>(given ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    unreadCount().then(c => { if (live) setN(c); }).catch(e => logSwallowed('count unread products', e));
    return () => { live = false; };
  }, [given]);
  if (!n) return null;
  const many = n !== 1, count = n.toLocaleString('en-IN');
  const go = async () => {
    setBusy(true);
    try {
      const r = await rereadFailed();
      setN(0);
      addToast(r.queued ? `${r.queued.toLocaleString('en-IN')} product${r.queued === 1 ? '' : 's'} will be read again over the next few minutes` : 'Nothing was left to read again', 'success');
      onQueued();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <PbTile variant="failed" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <Dot color={PB.failed} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal', flex: '1 1 220px' }}
        label={<span><span style={pbNum}>{count}</span> {many ? 'products' : 'product'} could not be read by the AI. Open one to see why, or read them all again.</span>} />
      <PbButton icon="refresh" style={{ whiteSpace: 'normal', padding: '8px 16px' }} onClick={() => void go()} busy={busy} busyLabel="Queuing…">{many ? `Read all ${count} again` : 'Read it again'}</PbButton>
    </PbTile>
  );
}
