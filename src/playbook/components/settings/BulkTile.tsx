// Settings → "Bulk changes": every bulk change of the last 7 days as hairline
// rows in one tile, newest first (what, how many, when, who, and what a
// revert did), each with "Revert" for an admin or manager while it can still
// be taken back (owner, 2026-11-12: "log all bulk changes … with option to
// revert them"). The button opens BulkRevertSheet, which says exactly what
// would change before anything does. Skeleton rows while loading, the failed
// tint with Try again on a load error, a one-line empty state.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { BULK_DAYS, listBulkRuns, type PbBulkRun } from '../../data/bulk';
import { istDate } from '../../format';
import { PB, pbBody, pbMeta } from '../../pbTheme';
import { Dot, NEUTRAL } from '../product/status';
import { PbButton, PbSection, PbSkelBar, PbTile } from '../ui';
import BulkRevertSheet from './BulkRevertSheet';
import { done, rows, verb } from './bulkText';

type AddToast = (msg: string, type?: 'success' | 'error' | 'info') => void;
const until = (r: PbBulkRun) => new Date(Date.parse(r.created_at) + BULK_DAYS * 86_400_000).toISOString();

function Row({ r, canEdit, onRevert }: { r: PbBulkRun; canEdit: boolean; onRevert: () => void }) {
  const open = r.status === 'done' || r.status === 'partly_reverted';
  const result = r.revert_result ? done(r.kind, r.revert_result) : '';
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', borderTop: `1px solid ${PB.tileBd}`, minWidth: 0 }}>
      <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...pbBody, fontWeight: 600, overflowWrap: 'anywhere' }}>{r.label}</span>
        <span style={pbMeta}>{rows(r.kind, r.items)} · {istDate(r.created_at)}{r.by?.full_name ? ` · by ${r.by.full_name}` : ''}</span>
        {r.status === 'running' && <Dot color={PB.review} label="Still running" />}
        {r.status === 'done' && <span style={pbMeta}>Can be taken back until {istDate(until(r))}</span>}
        {r.status !== 'running' && r.status !== 'done' && (
          <Dot color={r.status === 'reverted' ? NEUTRAL : PB.review} style={{ whiteSpace: 'normal' }}
            label={`${r.status === 'reverted' ? 'Reverted' : 'Partly reverted'} ${istDate(r.reverted_at)}${r.reverter?.full_name ? ` by ${r.reverter.full_name}` : ''}${result ? `: ${result}` : ''}`} />
        )}
      </div>
      {canEdit && open && <PbButton kind="danger" onClick={onRevert} aria-label={`${verb(r.kind)}: ${r.label}`}>{r.status === 'partly_reverted' ? 'Revert the rest' : verb(r.kind)}</PbButton>}
    </li>
  );
}

export default function BulkTile({ addToast, canEdit }: { addToast: AddToast; canEdit: boolean }) {
  const [runs, setRuns] = useState<PbBulkRun[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<PbBulkRun | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try { setRuns(await listBulkRuns()); setErr(''); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <PbTile as="section" variant={err && !runs ? 'failed' : 'default'}>
      <PbSection title="Bulk changes" id="pbs-bulk" right={runs ? <PbButton icon="refresh" onClick={() => void load()} busy={busy} busyLabel="Refreshing…">Refresh</PbButton> : null}
        hint={`Every change made to many products or listings at once in the last ${BULK_DAYS} days: imports, Send matching products, Re-price, Retry all, Read again, Archive the copies. A revert puts back only what is still as that change left it; anything changed by hand since is left alone.${canEdit ? '' : ' An admin or manager can revert.'}`}>
        {!runs && !err && (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="pb-sr" role="status">Loading bulk changes</span>
            {[0, 1].map(i => <span key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="55%" h={14} /><PbSkelBar w="75%" h={10} /></span>)}
          </div>
        )}
        {err && !runs && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Dot color={PB.failed} label="Could not load the bulk changes" style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
              <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{err}</span>
            </span>
            <PbButton icon="refresh" onClick={() => void load()} busy={busy} busyLabel="Trying again…">Try again</PbButton>
          </div>
        )}
        {runs && runs.length === 0 && <span style={{ ...pbBody, color: PB.tx2 }}>No bulk changes in the last {BULK_DAYS} days.</span>}
        {runs && runs.length > 0 && (
          <>
            {err && <span role="alert" style={{ ...pbMeta, color: PB.failed }}>Could not refresh: {err}</span>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
              {runs.map(r => <Row key={r.id} r={r} canEdit={canEdit} onRevert={() => setOpen(r)} />)}
            </ul>
          </>
        )}
      </PbSection>
      <BulkRevertSheet run={open} onClose={() => setOpen(null)} onDone={() => void load()} addToast={addToast} />
    </PbTile>
  );
}
