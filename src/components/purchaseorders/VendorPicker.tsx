// Vendor autosuggest + inline quick-add for the PO form.
// Only name + phone are mandatory (owner decision). Selecting an existing
// vendor snapshots its id/name/phone; quick-add inserts into po_vendors
// first, then selects it — so the vendor master grows as POs are raised.
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import type { POVendor } from '../../types/database';

type Picked = { id: string | null; name: string; phone: string };
type VendorRow = Pick<POVendor, 'id' | 'name' | 'phone'>;

export default function VendorPicker({ value, onPick, addToast, disabled }: {
  value: string;
  phone: string; // still accepted from the parent; intentionally NOT reused on manual edits (see onChange note)
  onPick: (v: Picked) => void;
  addToast: (m: string, t?: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState(value);
  const [suggestions, setSuggestions] = useState<VendorRow[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value); }, [value]);

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 1) { setSuggestions([]); return; }
    const { data } = await supabase.from('po_vendors').select('id, name, phone')
      .eq('is_active', true).ilike('name', `%${term.replace(/[%_]/g, '\\$&')}%`).order('name').limit(6);
    setSuggestions((data as VendorRow[] | null) || []);
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (v: VendorRow) => {
    onPick({ id: v.id, name: v.name, phone: v.phone || '' });
    setQ(v.name);
    setOpen(false);
  };

  const quickAdd = async () => {
    if (saving) return;
    if (!newName.trim()) { addToast('Vendor name is required', 'error'); return; }
    if (newPhone.replace(/\D/g, '').length < 10) { addToast('Enter a valid 10-digit phone', 'error'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('po_vendors')
        .insert({ name: newName.trim(), phone: newPhone.trim() }).select('id, name, phone').single();
      if (error) {
        // Unique (lower(name), phone) clash → fetch and reuse the existing row.
        if (error.code === '23505') {
          const { data: existing } = await supabase.from('po_vendors').select('id, name, phone')
            .ilike('name', newName.trim()).eq('phone', newPhone.trim()).maybeSingle();
          if (existing) { pick(existing as VendorRow); addToast('Vendor already existed — selected it', 'success'); setAdding(false); setSaving(false); return; }
        }
        addToast(friendlyError(error), 'error'); setSaving(false); return;
      }
      pick(data as VendorRow);
      addToast('Vendor added', 'success');
      setAdding(false);
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={q}
        disabled={disabled}
        onChange={e => { const v = e.target.value; setQ(v); onPick({ id: null, name: v, phone: '' }); search(v); setOpen(true); }}
        // ^ phone cleared on manual edit: it belonged to the previously PICKED
        //   vendor — carrying it onto a retyped free-text vendor printed the
        //   wrong phone on the PO.
        onFocus={() => { if (q) { search(q); setOpen(true); } }}
        placeholder="Search or type vendor name…"
        style={{ ...S.fInput, width: '100%' }}
      />
      {open && (suggestions.length > 0 || q.trim().length >= 1) && !disabled && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
          {suggestions.map(v => (
            <div key={v.id} onClick={() => pick(v)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${T.bd}`, fontSize: 13, color: T.tx }}
              onMouseEnter={e => (e.currentTarget.style.background = T.glass2)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontWeight: 600 }}>{v.name}</span>
              {v.phone && <span style={{ fontSize: 11, color: T.tx3, marginLeft: 8, fontFamily: T.mono }}>{v.phone}</span>}
            </div>
          ))}
          {!adding && (
            <div onClick={() => { setAdding(true); setNewName(q); setNewPhone(''); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: T.ac2, fontWeight: 600 }}>
              + Add new vendor{q.trim() ? ` "${q.trim()}"` : ''}
            </div>
          )}
          {adding && (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: T.glass1 }} onClick={e => e.stopPropagation()}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Vendor name *" style={{ ...S.fInput, width: '100%' }} autoFocus />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} onKeyDown={e => numericKeyDown(e)} inputMode="numeric" placeholder="Phone (10 digits) *" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={quickAdd} disabled={saving} style={{ ...S.btnPrimary, ...S.btnSm, flex: 1, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save vendor'}</button>
                <button onClick={() => setAdding(false)} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
