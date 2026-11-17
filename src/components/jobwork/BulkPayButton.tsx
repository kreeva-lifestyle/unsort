// The jobs list's "Bulk pay" button (admin/manager, Open tab). It works only
// when ONE jobworker is picked in the toolbar (owner, 2026-11-17): then it
// shows everything owed to them and opens the Bulk pay sheet. With all
// jobworkers, or nothing owed, it looks off and a tap says why instead of
// doing nothing.
import { Suspense, useEffect, useState } from 'react';
import { S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { BulkPayModal } from './jobworkLazy';
import { owedJobs, totalOf } from './jobworkBulkPay';
import { inr } from './jobworkModel';

export default function BulkPayButton({ vendor, version, onPaid, addToast }: {
  /** The jobworker picked in the toolbar; null = all jobworkers. */
  vendor: string | null;
  /** Bumped by the list after every write, so the total follows. */
  version: number;
  onPaid: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  // What is owed to the picked jobworker: undefined while it loads, null when the read failed.
  const [owed, setOwed] = useState<{ total: number; jobs: number } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!vendor) { setOwed(undefined); return; }
    let live = true;
    setOwed(undefined);
    owedJobs(vendor).then(r => {
      if (!live) return;
      if (r.error) { addToast(friendlyError(r.error), 'error'); setOwed(null); return; }
      setOwed({ total: totalOf(r.jobs), jobs: r.jobs.length });
    });
    return () => { live = false; };
  }, [vendor, version, attempt, addToast]);

  const ready = !!vendor && !!owed && owed.total > 0;
  const tap = () => {
    if (!vendor) return addToast('Pick one jobworker first: Bulk pay pays one jobworker’s jobs together.', 'info');
    if (owed === undefined) return;
    if (owed === null) return setAttempt(a => a + 1); // the read failed (already toasted): a tap tries again
    if (!ready) return addToast(`Nothing is owed to ${vendor} right now.`, 'info');
    setOpen(true);
  };
  const label = !vendor ? 'Bulk pay' : owed === undefined ? 'Bulk pay · …' : owed === null ? 'Bulk pay · retry' : `Bulk pay · ${inr(owed.total)}`;
  const hint = !vendor ? 'Pick one jobworker to pay all their jobs together'
    : owed ? `Pay ${owed.jobs} job${owed.jobs === 1 ? '' : 's'} of ${vendor} together` : undefined;

  return (<>
    <button type="button" className="jw-share-btn" onClick={tap} aria-disabled={!ready} title={hint}
      style={{ ...S.btnGhost, minHeight: 36, flexShrink: 0, whiteSpace: 'nowrap', opacity: ready ? 1 : 0.5 }}>{label}</button>
    {open && vendor && (
      <Suspense fallback={null}>
        <BulkPayModal vendor={vendor} onClose={() => setOpen(false)} onPaid={() => { setOpen(false); onPaid(); }} addToast={addToast} />
      </Suspense>
    )}
  </>);
}
