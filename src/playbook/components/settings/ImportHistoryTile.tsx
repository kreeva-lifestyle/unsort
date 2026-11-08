// Settings → "Imports from websites": the last 20 runs as hairline rows
// inside one tile (host in mono, status dot + label, counts, IST time, who
// the vendor is). Read-only; imports start from Products. Skeleton rows
// while loading, the failed tint with Try again on a load error, a one-line
// empty state.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { listImportRuns, type ImportRunRow } from '../../data/imports';
import { count, istDate } from '../../format';
import { PB, pbBody, pbMeta, pbNum } from '../../pbTheme';
import { RUN_STATUS, runCounts } from '../product/import/importText';
import { Dot } from '../product/status';
import { PbButton, PbSection, PbSkelBar, PbTile } from '../ui';

function Row({ r }: { r: ImportRunRow }) {
  const st = RUN_STATUS[r.status];
  const counts = runCounts(r);
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderTop: `1px solid ${PB.tileBd}`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ ...pbNum, fontSize: 13, fontWeight: 600, color: PB.tx, overflowWrap: 'anywhere', minWidth: 0 }}>{r.host}</span>
        <Dot color={st.color} label={st.label} />
        <span style={{ fontSize: 12, color: PB.tx3, marginLeft: 'auto' }}>{istDate(r.finished_at ?? r.created_at)}</span>
      </div>
      <div style={{ ...pbMeta, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
        {counts.length === 0 && <span>No products yet</span>}
        {counts.map(c => <span key={c.label} style={{ whiteSpace: 'nowrap' }}><span style={pbNum}>{count(c.n)}</span> {c.label}</span>)}
        {r.pb_vendors?.name && <span style={{ overflowWrap: 'anywhere' }}>vendor {r.pb_vendors.name}</span>}
      </div>
      {r.error && <span style={{ ...pbMeta, color: r.status === 'failed' ? PB.failed : PB.tx2, overflowWrap: 'anywhere' }}>{r.error}</span>}
    </li>
  );
}

export default function ImportHistoryTile() {
  const [rows, setRows] = useState<ImportRunRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await listImportRuns()); setErr(''); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <PbTile as="section" variant={err && !rows ? 'failed' : 'default'}>
      <PbSection title="Imports from websites" id="pbs-imports" right={rows ? <PbButton icon="refresh" onClick={() => void load()} busy={busy} busyLabel="Refreshing…">Refresh</PbButton> : null}
        hint="Every time a store’s products were copied into Products, newest first. Start one on Products → Import from website.">
        {!rows && !err && (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="pb-sr" role="status">Loading imports</span>
            {[0, 1, 2].map(i => <span key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="45%" h={14} /><PbSkelBar w="70%" h={10} /></span>)}
          </div>
        )}
        {err && !rows && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Dot color={PB.failed} label="Could not load the imports" style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
              <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{err}</span>
            </span>
            <PbButton icon="refresh" onClick={() => void load()} busy={busy} busyLabel="Trying again…">Try again</PbButton>
          </div>
        )}
        {rows && rows.length === 0 && <span style={{ ...pbBody, color: PB.tx2 }}>No imports yet.</span>}
        {rows && rows.length > 0 && (
          <>
            {err && <span role="alert" style={{ ...pbMeta, color: PB.failed }}>Could not refresh: {err}</span>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>{rows.map(r => <Row key={r.id} r={r} />)}</ul>
          </>
        )}
      </PbSection>
    </PbTile>
  );
}
