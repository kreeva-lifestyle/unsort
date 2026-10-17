// Pack Cam → Videos: find clips, watch them, and delete them in bulk — the
// ticked ones, or everything in the chosen dates (and camera). Deleting marks
// the clips; the office PC removes every copy (PC, Dropbox, Drive) within a
// few seconds and the row then shows as deleted.
import { useCallback, useEffect, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import DateInput from '../../ui/DateInput';
import { SkeletonRows } from '../../ui/Skeleton';
import Empty from '../../ui/Empty';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import ClipPlayer from '../../packcam/ClipPlayer';
import type { PackcamClip } from '../../../types/packcam';
import { cancelDelete, fetchClips, fmtDur, fmtSize, requestDelete, requestDeleteRange, type ClipFilter } from './packcamApi';

const STATUS: Record<string, { c: string; t: string }> = {
  queued: { c: T.yl, t: 'Waiting' }, cutting: { c: T.yl, t: 'Cutting' }, uploading: { c: T.bl, t: 'Uploading' },
  done: { c: T.gr, t: 'Saved' }, failed: { c: T.re, t: 'Failed' }, missing: { c: T.tx3, t: 'No recording' }, deleted: { c: T.tx3, t: 'Deleted' },
};
const sel: React.CSSProperties = { ...S.fInput, width: 'auto', minWidth: 120, flex: '1 1 120px' };

export default function ClipsPanel({ cameras, canDelete, addToast }: { cameras: string[]; canDelete: boolean; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState<ClipFilter>({ from: '', to: '', camera: '', status: '', awb: '' });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<{ rows: PackcamClip[]; total: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [watch, setWatch] = useState<PackcamClip | null>(null);
  const { ask, modalProps } = useConfirm();

  const load = useCallback(() => {
    fetchClips(f, page, size).then(setData).catch(e => { addToast(friendlyError(e), 'error'); setData({ rows: [], total: 0 }); });
  }, [f, page, size, addToast]);
  useEffect(() => { const t = setTimeout(load, f.awb ? 300 : 0); return () => clearTimeout(t); }, [load, f.awb]);
  const setFilter = (k: keyof ClipFilter, v: string) => { setF(p => ({ ...p, [k]: v })); setPage(0); setPicked(new Set()); };

  const rows = data?.rows || [];
  const pages = Math.max(1, Math.ceil((data?.total || 0) / size));
  const deletable = rows.filter(r => !r.deleted_at && !r.delete_requested_at);
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = deletable.length > 0 && deletable.every(r => picked.has(r.id));

  const run = async (label: string, fn: () => Promise<number>, done: (n: number) => string) => {
    setBusy(label);
    try { const n = await fn(); addToast(done(n), 'success'); setPicked(new Set()); setPage(0); load(); }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setBusy(''); }
  };
  const deletePicked = async () => {
    if (busy || !picked.size) return;
    if (!await ask({ title: `Delete ${picked.size} video${picked.size === 1 ? '' : 's'}?`, message: 'Every copy (PC, Dropbox, Google Drive) is removed. This cannot be undone once the PC has done it.', confirmLabel: 'Delete', danger: true })) return;
    run('picked', () => requestDelete([...picked]), n => `${n} video${n === 1 ? '' : 's'} marked — the PC deletes them in a few seconds`);
  };
  const deleteRange = async () => {
    if (busy) return;
    if (!f.from || !f.to) { addToast('Pick the From and To dates first', 'error'); return; }
    const scope = `${f.from} to ${f.to}${f.camera ? ` on camera ${f.camera}` : ' on all cameras'}`;
    if (!await ask({ title: 'Delete every video in these dates?', message: `All packing videos from ${scope} will be removed from the PC, Dropbox and Google Drive.`, confirmLabel: 'Delete all', danger: true })) return;
    run('range', () => requestDeleteRange(f.from, f.to, f.camera || null), n => `${n} video${n === 1 ? '' : 's'} marked for deletion`);
  };
  const undo = (id: string) => { if (!busy) run('undo', () => cancelDelete([id]), () => 'Delete cancelled'); };

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
          <option value="">All (not deleted)</option><option value="done">Saved</option><option value="queued">Waiting</option><option value="failed">Failed</option><option value="missing">No recording</option><option value="pending_delete">Being deleted</option><option value="deleted">Deleted</option>
        </select>
      </div>

      {canDelete && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.tx2, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(deletable.map(r => r.id)))} style={{ width: 18, height: 18, accentColor: T.ac }} />Select page
        </label>
        <button type="button" onClick={deletePicked} style={{ ...S.btnDanger, minHeight: 44, opacity: !picked.size || busy ? 0.4 : 1, pointerEvents: !picked.size || busy ? 'none' : 'auto' }}>{busy === 'picked' ? 'Deleting…' : `Delete selected (${picked.size})`}</button>
        <button type="button" onClick={deleteRange} title="Deletes everything in the From–To dates (and camera) above" style={{ ...S.btnGhost, minHeight: 44, color: T.re, opacity: busy ? 0.4 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy === 'range' ? 'Deleting…' : 'Delete all in these dates'}</button>
      </div>}

      {!data && <SkeletonRows rows={4} />}
      {data && !rows.length && <Empty icon="search" title="No packing videos" message={f.from || f.to || f.awb || f.camera || f.status ? 'Nothing matches these filters.' : 'Videos appear here once the office PC records scans.'} />}
      {rows.length > 0 && <div style={{ background: 'rgba(255,255,255,0.01)', border: `1px solid ${T.bd}`, borderRadius: 10 }}>
        {rows.map((r, i) => {
          const st = r.delete_requested_at && !r.deleted_at ? { c: T.re, t: 'Being deleted' } : STATUS[r.status] || STATUS.queued;
          const where = [r.pc_path && 'PC', r.dropbox_path && 'Dropbox', r.gdrive_file_id && 'Drive'].filter(Boolean).join(' · ');
          const canPick = canDelete && !r.deleted_at && !r.delete_requested_at;
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < rows.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
              {canDelete && <input type="checkbox" disabled={!canPick} checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.awb}`} style={{ width: 18, height: 18, accentColor: T.ac, flexShrink: 0, opacity: canPick ? 1 : 0.3 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.awb}</div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Cam {r.camera} · {new Date(r.scanned_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {fmtDur(r.duration_s)} · {fmtSize(r.size_bytes)}{where ? ` · ${where}` : ''}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11, color: T.tx2 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: st.c }} />{st.t}{r.error && r.status !== 'done' && <span style={{ color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {r.error}</span>}</div>
              </div>
              {r.delete_requested_at && !r.deleted_at && canDelete
                ? <button type="button" onClick={() => undo(r.id)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44 }}>Undo</button>
                : (r.status === 'done' || (r.status === 'failed' && (r.pc_path || r.dropbox_path))) && !r.deleted_at && <button type="button" onClick={() => setWatch(r)} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 44, minWidth: 64 }}>Play</button>}
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
      <ConfirmModal {...modalProps} />
    </div>
  );
}
