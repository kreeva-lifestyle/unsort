// Pack Cam → Videos: find clips and watch them. Pack Cam never deletes
// clips — the team clears old ones from the PC folder, Dropbox or Drive.
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import DateInput from '../../ui/DateInput';
import { SkeletonRows } from '../../ui/Skeleton';
import Empty from '../../ui/Empty';
import ClipPlayer from '../../packcam/ClipPlayer';
import NoVideoLookup from './NoVideoLookup';
import type { PackcamClip } from '../../../types/packcam';
import { fetchClips, fmtDur, fmtSize, playable, type ClipFilter } from './packcamApi';

const STATUS: Record<string, { c: string; t: string }> = {
  queued: { c: T.yl, t: 'Waiting' }, cutting: { c: T.yl, t: 'Cutting' }, uploading: { c: T.bl, t: 'Uploading' },
  done: { c: T.gr, t: 'Saved' }, failed: { c: T.re, t: 'Failed' }, missing: { c: T.tx3, t: 'No recording' }, removed: { c: T.tx3, t: 'Removed from PC' },
};
const sel: React.CSSProperties = { ...S.fInput, width: 'auto', minWidth: 120, flex: '1 1 120px' };

export default function ClipsPanel({ cameras, addToast }: { cameras: string[]; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState<ClipFilter>({ from: '', to: '', camera: '', status: '', awb: '' });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<{ rows: PackcamClip[]; total: number } | null>(null);
  const [watch, setWatch] = useState<PackcamClip | null>(null);
  const seq = useRef(0);

  // Only the newest request may fill the list (typing in search fires several).
  const load = useCallback(() => {
    const id = ++seq.current;
    fetchClips(f, page, size)
      .then(d => { if (id === seq.current) setData(d); })
      .catch(e => { if (id !== seq.current) return; addToast(friendlyError(e), 'error'); setData({ rows: [], total: 0 }); });
  }, [f, page, size, addToast]);
  useEffect(() => { const t = setTimeout(load, f.awb ? 300 : 0); return () => clearTimeout(t); }, [load, f.awb]);
  const setFilter = (k: keyof ClipFilter, v: string) => { setF(p => ({ ...p, [k]: v })); setPage(0); };

  const rows = data?.rows || [];
  const pages = Math.max(1, Math.ceil((data?.total || 0) / size));
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <input value={f.awb} onChange={e => setFilter('awb', e.target.value)} placeholder="Search AWB…" style={{ ...S.fInput, flex: '2 1 180px' }} />
        <DateInput value={f.from} max={f.to || undefined} onChange={e => setFilter('from', e.target.value)} style={{ flex: '1 1 140px' }} aria-label="From date" />
        <DateInput value={f.to} min={f.from || undefined} onChange={e => setFilter('to', e.target.value)} style={{ flex: '1 1 140px' }} aria-label="To date" />
        <select value={f.camera} onChange={e => setFilter('camera', e.target.value)} style={sel} aria-label="Camera">
          <option value="">All cameras</option>{cameras.map(c => <option key={c} value={c}>Camera {c}</option>)}
        </select>
        <select value={f.status} onChange={e => setFilter('status', e.target.value)} style={sel} aria-label="Status">
          <option value="">All statuses</option><option value="done">Saved</option><option value="queued">Waiting</option><option value="uploading">Uploading</option><option value="failed">Failed</option><option value="missing">No recording</option><option value="removed">Removed from PC</option>
        </select>
      </div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>Pack Cam does not delete videos. Clear old ones yourself from the PC's clips folder, Dropbox or Google Drive (one folder per day); a removed video just stops playing here.</div>

      {!data && <SkeletonRows rows={4} />}
      {data && !rows.length && f.awb.trim() && <NoVideoLookup awb={f.awb.trim()} filtered={!!(f.from || f.to || f.camera || f.status)} />}
      {data && !rows.length && !f.awb.trim() && <Empty icon="search" title="No packing videos" message={f.from || f.to || f.awb || f.camera || f.status ? 'Nothing matches these filters.' : 'Videos appear here once the office PC records scans.'} />}
      {rows.length > 0 && <div style={{ background: 'rgba(255,255,255,0.01)', border: `1px solid ${T.bd}`, borderRadius: 10 }}>
        {rows.map((r, i) => {
          const st = STATUS[r.status] || STATUS.queued;
          const where = [r.pc_path && 'PC', r.dropbox_path && 'Dropbox', r.gdrive_file_id && 'Drive'].filter(Boolean).join(' · ');
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < rows.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.awb}</div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Cam {r.camera} · {new Date(r.scanned_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {fmtDur(r.duration_s)} · {fmtSize(r.size_bytes)}{where ? ` · ${where}` : ''}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11, color: T.tx2, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: st.c, flexShrink: 0 }} />{st.t}{r.error && r.status !== 'done' && <span style={{ color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {r.error}</span>}</div>
              </div>
              {playable(r) && <button type="button" onClick={() => setWatch(r)} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 44, minWidth: 64 }}>Play</button>}
            </div>
          );
        })}
      </div>}

      {data && data.total > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {pages}</span>
          <button type="button" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= pages - 1 ? 0.3 : 1, pointerEvents: page >= pages - 1 ? 'none' : 'auto' }}>Next</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.tx3 }}>
          {data.total} video{data.total === 1 ? '' : 's'}
          <select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, background: T.glass2, border: `1px solid ${T.bd}`, color: T.tx }} aria-label="Per page">
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>}
      {watch && <ClipPlayer clip={watch} onClose={() => setWatch(null)} />}
    </div>
  );
}
