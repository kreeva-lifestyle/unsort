// Full-page Taught Mappings editor — permanent memory for marketplace value
// corrections. Server-side pagination + filters (column / taught vs ignored /
// text search) so the page stays fast as lessons accumulate.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { normHeader } from './templateParse';
import MappingRow from './MappingRow';
import type { ListingMapping, ListingTemplateField } from '../../types/database';

const PER_PAGE = [10, 25, 50, 100];

export default function TaughtMappingsPage({ onBack, onBulk, fields, addToast }: {
  onBack: () => void;
  onBulk: () => void;
  fields: ListingTemplateField[];
  addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<ListingMapping[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [colFilter, setColFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'taught' | 'ignored'>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [labels, setLabels] = useState<{ key: string; label: string }[]>([]);
  const [header, setHeader] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);

  const loadLabels = useCallback(async () => {
    const { data } = await supabase.from('listing_mappings').select('field_key, field_label').limit(2000);
    const seen = new Map<string, string>();
    for (const r of (data as { field_key: string; field_label: string }[] | null) || []) if (!seen.has(r.field_key)) seen.set(r.field_key, r.field_label);
    setLabels([...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)));
  }, []);

  const load = useCallback(async () => {
    let q = supabase.from('listing_mappings')
      .select('id, field_key, field_label, source, target, ignored, updated_at', { count: 'exact' });
    if (colFilter) q = q.eq('field_key', colFilter);
    if (typeFilter === 'taught') q = q.eq('ignored', false);
    if (typeFilter === 'ignored') q = q.eq('ignored', true);
    const s = debounced.replace(/[%,()]/g, '').trim();
    if (s) q = q.or(`source.ilike.%${s}%,target.ilike.%${s}%,field_label.ilike.%${s}%`);
    const { data, count, error } = await q.order('field_label').order('source').range(page * perPage, page * perPage + perPage - 1);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows((data as ListingMapping[] | null) || []);
    setTotal(count || 0);
  }, [addToast, colFilter, typeFilter, debounced, page, perPage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLabels(); }, [loadLabels]);

  const pickable = fields.filter(f => f.header);
  const picked = pickable.find(f => f.header === header);
  // Stale = the selected template HAS this column with a dropdown, but the
  // taught target is no longer one of its values (marketplace changed the sheet).
  const isStale = (r: ListingMapping) => {
    if (r.ignored) return false;
    const f = fields.find(x => normHeader(x.header) === r.field_key);
    return !!(f?.allowed?.length && !f.allowed.some(a => normHeader(a) === normHeader(r.target)));
  };

  const add = async () => {
    if (saving) return;
    if (!header) { addToast('Pick the column first', 'error'); return; }
    if (!source.trim() || !target.trim()) { addToast('Fill both the master value and the marketplace value', 'error'); return; }
    setSaving(true);
    try {
      // Same RPC as Bulk Teach: one atomic upsert on (column, master value) —
      // re-teaching replaces the old lesson, and un-ignores a dismissed value.
      const lesson = { field_key: normHeader(header), field_label: header, source: source.trim(), target: target.trim(), ignored: false };
      const { error } = await supabase.rpc('teach_bulk', { p_lessons: [lesson] });
      if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      addToast('Mapping taught — it will be used on every run now', 'success');
      setSource(''); setTarget('');
      load(); loadLabels();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const del = async (id: string) => {
    const { error } = await supabase.from('listing_mappings').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Mapping removed', 'success');
    setConfirmDel('');
    setPage(0);
    load(); loadLabels();
  };

  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bd}`, background: T.s2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ ...S.btnGhost, ...S.btnSm }}>← Back</button>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Taught Mappings</div>
          <button onClick={onBulk} title="Scan the whole master sheet and teach many values at once" style={{ ...S.btnGhost, ...S.btnSm, marginLeft: 'auto', color: T.ac2, border: '1px solid oklch(0.55 0.22 265 / .35)' }}>⚡ Bulk Teach</button>
        </div>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>
          Teach permanent corrections: when the master sheet says X for a column, always use Y on the marketplace. Applied instantly on every run — no AI cost, no repeated mistakes.
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={header} onChange={e => { setHeader(e.target.value); setTarget(''); }} style={{ ...S.fInput, flex: '1 1 150px', minWidth: 140 }}>
            <option value="">Column…</option>
            {pickable.map(f => <option key={f.header} value={f.header}>{f.header}</option>)}
          </select>
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="Master value (e.g. Jimmy Chu)" style={{ ...S.fInput, flex: '1 1 150px', minWidth: 140 }} />
          {picked?.allowed?.length ? (
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...S.fInput, flex: '1 1 150px', minWidth: 140 }}>
              <option value="">Use instead…</option>
              {picked.allowed.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="Use instead" style={{ ...S.fInput, flex: '1 1 150px', minWidth: 140 }} />
          )}
          <button onClick={add} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1, flexShrink: 0 }}>{saving ? 'Saving…' : 'Teach'}</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: '2 1 180px', minWidth: 160 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="1.8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mappings…" style={{ ...S.fSearch, width: '100%' }} />
          </div>
          <select value={colFilter} onChange={e => { setColFilter(e.target.value); setPage(0); }} style={{ ...S.fInput, flex: '1 1 130px', minWidth: 120 }}>
            <option value="">All columns</option>
            {labels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value as typeof typeFilter); setPage(0); }} style={{ ...S.fInput, flex: '1 1 110px', minWidth: 100 }}>
            <option value="all">All types</option>
            <option value="taught">Taught</option>
            <option value="ignored">Ignored</option>
          </select>
        </div>
        {total === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
            {debounced || colFilter || typeFilter !== 'all' ? 'No mappings match these filters.' : 'Nothing taught yet. When a run maps a value you don’t like, teach the correct one above — it sticks forever.'}
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            {rows.map(r => (
              <MappingRow key={r.id} r={r} stale={isStale(r)} confirming={confirmDel === r.id}
                onAskDelete={() => setConfirmDel(r.id)} onCancelDelete={() => setConfirmDel('')} onDelete={() => del(r.id)} />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1 }}>Prev</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= pages - 1 ? 0.3 : 1 }}>Next</button>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: T.tx3 }}>{total} mapping{total !== 1 ? 's' : ''}</span>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ ...S.fInput, width: 'auto', height: 28, fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>
            {PER_PAGE.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
