// Taught Mappings modal: the module's permanent memory. Teach it once that a
// master value maps to a marketplace value ("Jimmy Chu" → "Art Silk") and
// every future run applies it in code — deterministic and free. Mappings are
// keyed by the column header, so one correction covers every template that
// shares the column.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { normHeader } from './templateParse';
import type { ListingMapping, ListingTemplateField } from '../../types/database';

export default function MappingsManager({ open, onClose, fields, addToast }: {
  open: boolean;
  onClose: () => void;
  fields: ListingTemplateField[]; // fields of the selected template (for the pickers)
  addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<ListingMapping[]>([]);
  const [header, setHeader] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('listing_mappings')
      .select('id, field_key, field_label, source, target, updated_at').order('field_label').order('source');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows((data as ListingMapping[] | null) || []);
  }, [addToast]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', open);
    return () => document.body.classList.remove('modal-open');
  }, [open]);
  useEffect(() => { if (open) load(); else { setHeader(''); setSource(''); setTarget(''); setSaving(false); setConfirmDel(''); } }, [open, load]);

  if (!open) return null;

  const pickable = fields.filter(f => f.header && !/price|mrp|gst/i.test(f.header));
  const picked = pickable.find(f => f.header === header);

  const add = async () => {
    if (saving) return;
    if (!header) { addToast('Pick the column first', 'error'); return; }
    if (!source.trim() || !target.trim()) { addToast('Fill both the master value and the marketplace value', 'error'); return; }
    setSaving(true);
    try {
      const key = normHeader(header);
      const payload = { field_key: key, field_label: header, source: source.trim(), target: target.trim(), updated_at: new Date().toISOString() };
      // Same column + same source (case-insensitive) replaces the old lesson.
      const existing = rows.find(r => r.field_key === key && r.source.trim().toLowerCase() === source.trim().toLowerCase());
      const { error } = existing
        ? await supabase.from('listing_mappings').update(payload).eq('id', existing.id)
        : await supabase.from('listing_mappings').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id });
      if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      addToast(existing ? 'Mapping updated' : 'Mapping taught — it will be used on every run now', 'success');
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

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Taught Mappings</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
            Teach a permanent correction: when the master sheet says X for a column, always use Y on the marketplace sheet. Applied instantly on every run — no AI cost, no repeated mistakes.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <select value={header} onChange={e => { setHeader(e.target.value); setTarget(''); }} style={{ ...S.fInput, flex: '1 1 150px' }}>
              <option value="">Column…</option>
              {pickable.map(f => <option key={f.header} value={f.header}>{f.header}</option>)}
            </select>
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="Master value (e.g. Jimmy Chu)" style={{ ...S.fInput, flex: '1 1 150px' }} />
            {picked?.allowed?.length ? (
              <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...S.fInput, flex: '1 1 150px' }}>
                <option value="">Use instead…</option>
                {picked.allowed.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="Use instead" style={{ ...S.fInput, flex: '1 1 150px' }} />
            )}
            <button onClick={add} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Teach'}</button>
          </div>
          {rows.length === 0 && (
            <div style={{ padding: '26px 10px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
              Nothing taught yet. When a run maps a value you don't like, teach the correct one here — it sticks forever.
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ maxHeight: '42vh', overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8, marginTop: 8 }}>
              {rows.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}` }}>
                  <span style={{ fontSize: 10, color: T.tx3, width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.field_label}>{r.field_label}</span>
                  <span style={{ fontSize: 12, color: T.tx2, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                    {r.source} <span style={{ color: T.tx3 }}>→</span> <span style={{ color: T.ac2, fontWeight: 600 }}>{r.target}</span>
                  </span>
                  {confirmDel === r.id ? (
                    <>
                      <button onClick={() => del(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Confirm</button>
                      <button onClick={() => setConfirmDel('')} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDel(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
