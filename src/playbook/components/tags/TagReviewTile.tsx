// The review queue: tags never reviewed (the "new" count in the title, the
// same count as the Settings tile), plus tags reviewed lately (first seen in
// the last 30 days), each with its uses and three example products. Row
// actions Keep / Hide / Edit, bulk select with Keep / Hide / Merge into… in a
// bar that sticks to the top while the list scrolls, and the shortcut "Hide
// all that look like codes" (the same code test the cleaner uses). Reloads
// when `version` changes (an action elsewhere on the page).
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbTagReview } from '../../tagTypes';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import { PbButton, PbSection, PbTile } from '../ui';
import { looksLikeCode } from './tagCleanPreview';
import TagEditModal, { type TagEdit } from './TagEditModal';
import TagCheck from './TagCheck';
import TagRow from './TagRow';
import { TagRowsSkeleton, TagsEmpty, TagsError } from './TagStates';
import { plural } from './tagText';
import { useTagActions } from './useTagActions';

export default function TagReviewTile({ api, addToast, version, onChanged }: { api: TagsApi; addToast: AddToast; version: number; onChanged: () => void }) {
  const [rows, setRows] = useState<PbTagReview[] | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ tag: PbTagReview | null; ids: string[] } | null>(null);
  const { busy, rowBusy, run, edit: runEdit } = useTagActions(api, addToast, onChanged);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.review()); setErr(''); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load, version]);
  useEffect(() => { setSel(s => (rows ? new Set([...s].filter(id => rows.some(r => r.id === id))) : s)); }, [rows]);

  const ids = [...sel];
  const codes = (rows ?? []).filter(r => !r.hidden && looksLikeCode(r.name));
  const pick = (id: string, on: boolean) => setSel(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const allOn = !!rows?.length && rows.every(r => sel.has(r.id));
  const bulk = async (action: 'keep' | 'hide') => { if (await run(ids, action, {}, `bulk:${action}`)) setSel(new Set()); };
  const onEdit = async (e: TagEdit) => {
    if (!edit) return;
    const ok = await runEdit(edit.ids, e);
    if (ok) { setEdit(null); setSel(new Set()); }
  };

  const n = rows?.length ?? 0;
  const fresh = (rows ?? []).filter(r => !r.reviewed_at).length;
  const title = rows === null ? 'Tags to review' : n === 0 ? 'Nothing to review' : fresh === 0 ? 'Nothing new to review' : `${plural(fresh, 'new tag')} to review`;
  const lately = n > fresh ? ` The other ${n - fresh === 1 ? 'one was' : `${n - fresh} were`} reviewed lately and stay listed for 30 days.` : '';
  return (
    <PbTile as="section" variant={err && !rows ? 'failed' : 'default'} aria-labelledby="pbt-review">
      <PbSection title={title} id="pbt-review"
        hint={`New tags land here after an import, an AI read or a hand edit. Keep the real ones, hide the junk (codes, labels, size charts), and merge spellings of the same thing.${lately}`}
        right={codes.length > 0 ? <PbButton icon="eyeOff" onClick={() => void run(codes.map(c => c.id), 'hide', {}, 'codes')} busy={busy === 'codes'} busyLabel="Hiding…" dim={!!busy && busy !== 'codes'}>{codes.length === 1 ? 'Hide the 1 that looks like a code' : `Hide all ${codes.length} that look like codes`}</PbButton> : null}>
        {rows === null && !err && <TagRowsSkeleton label="Loading tags to review" />}
        {err && !rows && <TagsError title="Could not load the review queue" message={err} onRetry={() => void load()} busy={loading} />}
        {rows && n === 0 && (
          <TagsEmpty icon="check" title="All tags are reviewed">Every tag in the library has been looked at. New ones appear here as products come in.</TagsEmpty>
        )}
        {rows && n > 0 && (
          <>
            {err && <span role="alert" style={{ ...pbMeta, color: PB.failed }}>Could not refresh: {err}</span>}
            {/* Sticks to the top of the scroll while the queue scrolls, so the bulk buttons are never 2,000 px away. */}
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: PB.tileSolid, margin: '0 -4px', padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: -8, ...pbMeta, color: PB.tx }}>
                <TagCheck checked={allOn} onChange={on => setSel(on ? new Set(rows.map(r => r.id)) : new Set())} label="Select every tag in the queue"
                  text={ids.length ? <><span style={pbNum}>{ids.length}</span> selected</> : 'Select all'} />
              </span>
              {ids.length > 0 && (
                <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  <PbButton icon="check" onClick={() => void bulk('keep')} busy={busy === 'bulk:keep'} busyLabel="Keeping…" dim={!!busy && busy !== 'bulk:keep'}>Keep {ids.length}</PbButton>
                  <PbButton icon="eyeOff" onClick={() => void bulk('hide')} busy={busy === 'bulk:hide'} busyLabel="Hiding…" dim={!!busy && busy !== 'bulk:hide'}>Hide {ids.length}</PbButton>
                  {ids.length > 1 && <PbButton icon="merge" onClick={() => setEdit({ tag: null, ids })} dim={!!busy}>Merge into…</PbButton>}
                </span>
              )}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
              {rows.map(r => (
                <TagRow key={r.id} t={r} queue selected={sel.has(r.id)} onSelect={on => pick(r.id, on)} busy={rowBusy(r.id)}
                  onKeep={() => void run([r.id], 'keep')} onHide={() => void run([r.id], r.hidden ? 'unhide' : 'hide')} onEdit={() => setEdit({ tag: r, ids: [r.id] })} />
              ))}
            </ul>
          </>
        )}
      </PbSection>
      <TagEditModal open={!!edit} tag={edit?.tag ?? null} count={edit?.ids.length} suggest={api.suggest} onClose={() => setEdit(null)} onSave={e => void onEdit(e)} saving={!!busy} />
    </PbTile>
  );
}
