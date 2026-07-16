// Full-page Taught Mappings editor — permanent memory for marketplace value corrections.
// Unlike templates (per-marketplace sheets), mappings are global and persistent across re-uploads.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { normHeader } from './templateParse';
import type { ListingMapping, ListingTemplateField } from '../../types/database';

export default function TaughtMappingsPage({ onBack, onBulk, fields, addToast }: {
  onBack: () => void;
  onBulk: () => void;
  fields: ListingTemplateField[];
  addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<ListingMapping[]>([]);
  const [header, setHeader] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('listing_mappings')
      .select('id, field_key, field_label, source, target, ignored, updated_at').order('field_label').order('source');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows((data as ListingMapping[] | null) || []);
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const pickable = fields.filter(f => f.header && !/price|mrp|gst/i.test(f.header));
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
      load();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const del = async (id: string) => {
    const { error } = await supabase.from('listing_mappings').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Mapping removed', 'success');
    setConfirmDel('');
    load();
  };

  const filtered = rows.filter(r =>
    !search || r.field_label.toLowerCase().includes(search.toLowerCase()) ||
    r.source.toLowerCase().includes(search.toLowerCase()) ||
    r.target.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with back button */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bd}`, background: T.s2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ ...S.btnGhost, ...S.btnSm }}>← Back</button>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Taught Mappings</div>
          <button onClick={onBulk} title="Scan the whole master sheet and teach many values at once" style={{ ...S.btnGhost, ...S.btnSm, marginLeft: 'auto', color: T.ac2, border: '1px solid rgba(99,102,241,.35)' }}>⚡ Bulk Teach</button>
        </div>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>
          Teach permanent corrections: when the master sheet says X for a column, always use Y on the marketplace. Applied instantly on every run — no AI cost, no repeated mistakes.
        </div>
      </div>

      {/* Teaching form */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
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

      {/* Search and list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '14px 16px' }}>
        {rows.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mappings…"
              style={{ ...S.fInput, width: '100%', marginBottom: 8 }}
            />
            <div style={{ fontSize: 10, color: T.tx3 }}>
              Showing {filtered.length} of {rows.length} mapping{rows.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {rows.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.tx3, textAlign: 'center', padding: '40px 20px' }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 8 }}>Nothing taught yet</div>
              <div style={{ fontSize: 11 }}>When a run maps a value you don't like, teach the correct one above — it sticks forever.</div>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ flex: 1, overflow: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            <div style={{ display: 'grid', gap: 0 }}>
              {filtered.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 13 }}>
                  <div style={{ width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 10, color: T.tx3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }} title={r.field_label}>{r.field_label}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, wordBreak: 'break-word' }}>
                      <span style={{ color: T.tx2, textDecoration: r.ignored ? 'line-through' : 'none', opacity: r.ignored ? 0.6 : 1 }}>{r.source}</span>
                      {r.ignored ? (
                        <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: 'rgba(255,255,255,.06)', color: T.tx3 }}>ignored — never suggested (delete to bring it back)</span>
                      ) : (<>
                        <span style={{ color: T.tx3, fontSize: 11 }}>→</span>
                        <span style={{ color: T.ac2, fontWeight: 600 }}>{r.target}</span>
                      </>)}
                    </div>
                    {isStale(r) && (
                      <div title="The marketplace changed this column's dropdown — this value no longer exists in it. Teach the new value (same column + same master value replaces this lesson)." style={{ marginTop: 4, padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: 'rgba(239,68,68,.12)', color: T.re, whiteSpace: 'nowrap', display: 'inline-block' }}>
                        not in this sheet's list anymore
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {confirmDel === r.id ? (
                      <>
                        <button onClick={() => del(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Confirm</button>
                        <button onClick={() => setConfirmDel('')} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDel(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
