// "Revert" on a bulk change (Settings → Bulk changes): a short sheet that
// first asks the server what a revert would do right now and says it in
// plain sentences (bulkText.ts plan), then one button that does it. Nothing
// is changed before the button. When the server refuses (already reverted,
// older than 7 days, a later bulk change built on it) its sentence is shown
// and there is no button. Desktop footer: Cancel then the action; phone: one
// full-width action (Cancel is the ×, swipe down or Back).
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { previewRevert, revertBulk, type BulkCounts, type PbBulkRun } from '../../data/bulk';
import { istDate } from '../../format';
import { useIsPhone } from '../../hooks/useIsPhone';
import { PB, pbBody, pbErrorBox, pbMeta } from '../../pbTheme';
import PbModal from '../product/PbModal';
import { PbButton, PbSkelBar } from '../ui';
import { done, onlyStops, plan, rows } from './bulkText';

type AddToast = (msg: string, type?: 'success' | 'error' | 'info') => void;

export default function BulkRevertSheet({ run, onClose, onDone, addToast }: { run: PbBulkRun | null; onClose: () => void; onDone: () => void; addToast: AddToast }) {
  const phone = useIsPhone();
  const [counts, setCounts] = useState<BulkCounts | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const id = run?.id;
  useEffect(() => {
    setCounts(null); setErr(''); setBusy(false); // a fresh look every time the sheet opens
    if (!id) return;
    let live = true;
    previewRevert(id).then(c => { if (live) setCounts(c); }).catch(e => { if (live) setErr(friendlyError(e)); });
    return () => { live = false; };
  }, [id]);
  const p = run && counts ? plan(run, counts) : null;
  const go = async () => {
    if (!run || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await revertBulk(run.id);
      addToast(done(run.kind, r) || 'Reverted', 'success');
      onDone(); onClose();
    } catch (e) { setErr(friendlyError(e)); onDone(); } finally { setBusy(false); }
  };
  const stops = !!run && onlyStops(run.kind);
  return (
    <PbModal open={!!run} title={stops ? 'Stop what is still waiting?' : 'Revert this bulk change?'} onClose={onClose}
      footer={p && p.todo > 0 ? (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {!phone && <PbButton onClick={onClose} dim={busy}>Cancel</PbButton>}
          <PbButton kind={p.danger ? 'danger' : 'primary'} block={phone} onClick={() => void go()} busy={busy} busyLabel={stops ? 'Stopping…' : 'Reverting…'}>{p.confirm}</PbButton>
        </div>
      ) : undefined}>
      {run && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ ...pbBody, fontWeight: 600, overflowWrap: 'anywhere' }}>{run.label}</span>
            <span style={pbMeta}>{rows(run.kind, run.items)} · {istDate(run.created_at)}{run.by?.full_name ? ` · by ${run.by.full_name}` : ''}</span>
          </div>
          {!counts && !err && (
            <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="pb-sr" role="status">Checking what a revert would change</span>
              <PbSkelBar w="92%" h={14} /><PbSkelBar w="70%" h={14} /><PbSkelBar w="80%" h={14} />
            </div>
          )}
          {p && (
            <>
              {p.todo === 0 && <span style={{ ...pbBody, fontWeight: 600 }}>Nothing is left to take back.</span>}
              <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.lines.map(l => <li key={l} style={{ ...pbBody, overflowWrap: 'anywhere' }}>{l}</li>)}
              </ul>
              {p.todo > 0 && <span style={{ ...pbMeta, borderTop: `1px solid ${PB.tileBd}`, paddingTop: 12 }}>{p.note} Anything changed by hand since is left as it is.</span>}
            </>
          )}
          {err && <div role="alert" style={{ ...pbErrorBox, overflowWrap: 'anywhere' }}>{err}</div>}
        </div>
      )}
    </PbModal>
  );
}
