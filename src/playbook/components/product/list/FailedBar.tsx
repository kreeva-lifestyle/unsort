// Products → Failed (also where the dashboard's Failed tile leads): "N listings
// failed" with "Retry all N" — every failed listing gets its tries again
// (retry_failed); the automation sends them about ten a minute. Follows the
// website filter. Two signals: "Retrying…" on the button, then a toast.
// Hidden when nothing failed.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { logSwallowed } from '../../../../lib/errorLogger';
import type { AddToast } from '../../PbToasts';
import { failedCount, retryFailed } from '../../../data/listings';
import { PB, pbNum } from '../../../pbTheme';
import { PbButton, PbTile } from '../../ui';
import { Dot } from '../status';

export default function FailedBar({ websiteId, addToast, onRetried, count: given }: { websiteId: string; addToast: AddToast; onRetried: () => void; count?: number }) {
  const [n, setN] = useState<number | null>(given ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    setN(null);
    failedCount(websiteId).then(c => { if (live) setN(c); }).catch(e => logSwallowed('count failed listings', e));
    return () => { live = false; };
  }, [websiteId, given]);
  if (!n) return null;
  const many = n !== 1, count = n.toLocaleString('en-IN');
  const go = async () => {
    setBusy(true);
    try {
      const r = await retryFailed(websiteId);
      setN(0);
      addToast(r.retried ? `${r.retried.toLocaleString('en-IN')} listing${r.retried === 1 ? '' : 's'} will be tried again — about ten a minute` : 'Nothing was left to retry', 'success');
      onRetried();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <PbTile variant="failed" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <Dot color={PB.failed} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal', flex: '1 1 220px' }}
        label={<><span style={pbNum}>{count}</span> {many ? 'listings' : 'listing'} failed{websiteId ? ' on this website' : ''}. Open one to see why, or try them all again.</>} />
      <PbButton icon="refresh" style={{ whiteSpace: 'normal', padding: '8px 16px' }} onClick={() => void go()} busy={busy} busyLabel="Retrying…">Retry all {count}</PbButton>
    </PbTile>
  );
}
