// The tag library: every tag Playbook has seen, most used first, 25 a page,
// with search, a kind filter and All / Visible / Hidden. Hidden tags are
// struck through with a "Hidden from websites" label. Row actions Hide /
// Unhide / Edit, bulk select with Hide / Unhide / Merge into…. Filters reset
// the page to the first one; reloads when `version` changes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import { EMPTY_LIBRARY_FILTER, type LibraryFilter, type LibraryPage, type TagsApi } from '../../data/tags';
import { TAG_KINDS, TAG_PAGE, type PbTagKind } from '../../tagTypes';
import { PB, pbInput, pbMeta, pbNum } from '../../pbTheme';
import Pager from '../product/Pager';
import { PbButton, PbIcon, PbSection, PbTile } from '../ui';
import { Seg } from '../website/ui';
import TagEditModal, { type TagEdit } from './TagEditModal';
import TagCheck from './TagCheck';
import TagRow, { type TagRowData } from './TagRow';
import { TagRowsSkeleton, TagsEmpty, TagsError } from './TagStates';
import { useTagActions } from './useTagActions';

export default function TagLibraryTile({ api, addToast, version, onChanged }: { api: TagsApi; addToast: AddToast; version: number; onChanged: () => void }) {
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_LIBRARY_FILTER);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<LibraryPage | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ tag: TagRowData | null; ids: string[] } | null>(null);
  const seq = useRef(0);
  const { busy, rowBusy, run, edit: runEdit } = useTagActions(api, addToast, onChanged);

  useEffect(() => { const t = setTimeout(() => { setFilter(f => (f.q === search ? f : { ...f, q: search })); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await api.library(filter, page);
      if (my !== seq.current) return;
      const last = Math.max(0, Math.ceil(r.count / TAG_PAGE) - 1);
      if (page > last) { setPage(last); return; }
      setData(r); setErr('');
    } catch (e) { if (my === seq.current) setErr(friendlyError(e)); }
    finally { if (my === seq.current) setLoading(false); }
  }, [api, filter, page]);
  useEffect(() => { void load(); }, [load, version]);
  useEffect(() => { setSel(new Set()); }, [filter, page]);

  const rows = data?.rows ?? [];
  const ids = [...sel];
  const filtered = !!(filter.q || filter.kind || filter.hidden);
  const set = (p: Partial<LibraryFilter>) => { setFilter(f => ({ ...f, ...p })); setPage(0); };
  const clear = () => { setSearch(''); set(EMPTY_LIBRARY_FILTER); };
  const pick = (id: string, on: boolean) => setSel(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const bulk = async (action: 'hide' | 'unhide') => { if (await run(ids, action, {}, `bulk:${action}`)) setSel(new Set()); };
  const onEdit = async (e: TagEdit) => { if (edit && (await runEdit(edit.ids, e))) { setEdit(null); setSel(new Set()); } };
  const counts = data?.counts;

  return (
    <PbTile as="section" variant={err && !data ? 'failed' : 'default'} aria-labelledby="pbt-library">
      <PbSection title="Library" id="pbt-library"
        hint={counts ? <><span style={pbNum}>{counts.all.toLocaleString('en-IN')}</span> tags in all · <span style={pbNum}>{counts.hidden.toLocaleString('en-IN')}</span> hidden from websites. A hidden tag stays on its products, so un-hiding brings it back.</> : 'Every tag Playbook has seen, most used first.'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, alignItems: 'end' }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: PB.tx3, display: 'inline-flex' }}><PbIcon name="search" size={16} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tags" aria-label="Search tags" className="pb-input" style={{ ...pbInput, paddingLeft: 40 }} />
          </div>
          <select value={filter.kind} onChange={e => set({ kind: e.target.value as PbTagKind | '' })} aria-label="Kind" className="pb-input" style={pbInput}>
            <option value="">Every kind</option>
            {TAG_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <div className="pb-seg-3" style={{ minWidth: 0 }}><Seg label="Show" value={filter.hidden} onChange={v => set({ hidden: v })} options={[{ id: '', label: 'All' }, { id: 'visible', label: 'Visible' }, { id: 'hidden', label: 'Hidden' }]} /></div>
        </div>
        {data === null && !err && <TagRowsSkeleton count={5} label="Loading the tag library" />}
        {err && !data && <TagsError title="Could not load the library" message={err} onRetry={() => void load()} busy={loading} />}
        {data && rows.length === 0 && (filtered
          ? <TagsEmpty icon="search" title="No tag matches" action={<PbButton icon="x" onClick={clear}>Clear filters</PbButton>}>Nothing matches these filters.</TagsEmpty>
          : <TagsEmpty icon="tag" title="No tags yet">Tags arrive with products: from an import, the AI reader, or typed on a product page.</TagsEmpty>)}
        {data && rows.length > 0 && (
          <>
            {err && <span role="alert" style={{ ...pbMeta, color: PB.failed }}>Could not refresh: {err}</span>}
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: PB.tileSolid, margin: '0 -4px', padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: -8, ...pbMeta, color: PB.tx }}>
                <TagCheck checked={rows.every(r => sel.has(r.id))} onChange={on => setSel(on ? new Set(rows.map(r => r.id)) : new Set())} label="Select every tag on this page"
                  text={ids.length ? <><span style={pbNum}>{ids.length}</span> selected</> : 'Select all on this page'} />
              </span>
              {ids.length > 0 && (
                <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  <PbButton icon="eyeOff" onClick={() => void bulk('hide')} busy={busy === 'bulk:hide'} busyLabel="Hiding…" dim={!!busy && busy !== 'bulk:hide'}>Hide {ids.length}</PbButton>
                  <PbButton icon="eye" onClick={() => void bulk('unhide')} busy={busy === 'bulk:unhide'} busyLabel="Showing…" dim={!!busy && busy !== 'bulk:unhide'}>Unhide {ids.length}</PbButton>
                  {ids.length > 1 && <PbButton icon="merge" onClick={() => setEdit({ tag: null, ids })} dim={!!busy}>Merge into…</PbButton>}
                </span>
              )}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }} aria-busy={loading || undefined}>
              {rows.map(r => (
                <TagRow key={r.id} t={r} selected={sel.has(r.id)} onSelect={on => pick(r.id, on)} busy={rowBusy(r.id)}
                  onHide={() => void run([r.id], r.hidden ? 'unhide' : 'hide')} onEdit={() => setEdit({ tag: r, ids: [r.id] })} />
              ))}
            </ul>
            <Pager page={page} pageSize={TAG_PAGE} count={data.count} onPage={setPage} noun="tag" />
          </>
        )}
      </PbSection>
      <TagEditModal open={!!edit} tag={edit?.tag ?? null} count={edit?.ids.length} suggest={api.suggest} onClose={() => setEdit(null)} onSave={e => void onEdit(e)} saving={!!busy} />
    </PbTile>
  );
}
