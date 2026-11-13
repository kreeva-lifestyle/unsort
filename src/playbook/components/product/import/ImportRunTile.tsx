// The import run tile at the top of Products: where the newest run is
// (dot + label, the host, mono counts), refreshed every 10 s by useImportRun.
// Running: "You can leave this page" + Cancel import. Done: the counts +
// Show these products (the list filtered to the website they were copied from — an import may have no vendor,
// owner 2026-11-13) + Dismiss.
// Failed: the plain reason (failed tint) + Try again (opens the sheet with the
// address; not offered when the store's own rules refused us) + Dismiss. Cancel is a secondary button — the one
// gradient on Products stays "+ Add product".
import { useState } from 'react';
import type { AddToast } from '../../PbToasts';
import { cancelImport, type ImportRunRow } from '../../../data/imports';
import { count, istDate, istRelative } from '../../../format';
import { PB, pbBody, pbMeta, pbNum } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbTile from '../../ui/PbTile';
import { Dot } from '../status';
import { RUN_STATUS, importError, refusedByStore, runCounts, runTitle } from './importText';

export default function ImportRunTile({ run, pollError, onChanged, onDismiss, onRetry, onShow, addToast }: {
  run: ImportRunRow; pollError: string; onChanged: () => void; onDismiss: () => void; onRetry: (url: string) => void; onShow?: (host: string) => void; addToast: AddToast;
}) {
  const [cancelling, setCancelling] = useState(false);
  const st = RUN_STATUS[run.status];
  const active = run.status === 'queued' || run.status === 'running';
  const counts = runCounts(run);
  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try { await cancelImport(run.id); addToast(`Import from ${run.host} cancelled`, 'success'); onChanged(); }
    catch (e) { addToast(importError(e), 'error'); }
    finally { setCancelling(false); }
  };
  const when = run.status === 'done' || run.status === 'failed' || run.status === 'cancelled' ? run.finished_at : run.status === 'queued' ? run.created_at : run.started_at ?? run.created_at;
  return (
    <PbTile as="section" variant={run.status === 'failed' ? 'failed' : 'default'} aria-labelledby="pb-imprun-title"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, minWidth: 0 }}>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Dot color={st.color} label={st.label} style={{ color: PB.tx, fontWeight: 600, fontSize: 13 }} />
          {when && <span style={{ fontSize: 12, color: PB.tx3 }} title={istDate(when)}>{run.status === 'queued' ? 'queued ' : active ? 'started ' : ''}{istRelative(when)}</span>}
        </div>
        <h2 id="pb-imprun-title" style={{ ...pbBody, fontWeight: 600, fontSize: 15, margin: 0, overflowWrap: 'anywhere' }}>{runTitle(run)}</h2>
        {counts.length > 0 && (
          <div style={{ ...pbMeta, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }} aria-live="polite">
            {counts.map(c => <span key={c.label} style={{ whiteSpace: 'nowrap' }}><span style={{ ...pbNum, color: PB.tx, fontWeight: 600 }}>{count(c.n)}</span> {c.label}</span>)}
            {run.pb_vendors?.name && <span style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>vendor {run.pb_vendors.name}</span>}
          </div>
        )}
        {run.error && <div style={{ ...pbBody, color: run.status === 'failed' ? PB.tx : PB.tx2, overflowWrap: 'anywhere' }}>{run.error}</div>}
        {active && <span style={pbMeta}>You can leave this page. It keeps going on the server and the new products appear in the list below.</span>}
        {pollError && <span style={{ ...pbMeta, color: PB.failed }}>Could not refresh the progress: {pollError}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
        {active && <PbButton onClick={() => void cancel()} busy={cancelling} busyLabel="Cancelling…">Cancel import</PbButton>}
        {run.status === 'done' && run.added > 0 && onShow && <PbButton onClick={() => onShow(run.host)}>Show these products</PbButton>}
        {run.status === 'failed' && !refusedByStore(run.error) && <PbButton icon="refresh" onClick={() => onRetry(run.url)}>Try again</PbButton>}
        {!active && <PbButton onClick={onDismiss}>Dismiss</PbButton>}
      </div>
    </PbTile>
  );
}
