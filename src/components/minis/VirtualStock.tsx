import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';

interface VsRow { id: string; sku: string; quantity: number }

export default function VirtualStock({ setStock, addToast }: { stock: Record<string, number>; setStock: (s: Record<string, number>) => void; addToast: (msg: string, type?: string) => void }) {
  const [rows, setRows] = useState<VsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [expanded, setExpanded] = useState(false);

  const fetch = useCallback(async () => {
    const { data, error } = await supabase.from('virtual_stock').select('id, sku, quantity').order('sku').limit(1000);
    if (error) addToast('Failed to load virtual stock — ' + friendlyError(error), 'error');
    const items = data || [];
    setRows(items);
    const map: Record<string, number> = {};
    for (const r of items) if (r.quantity > 0) map[r.sku] = r.quantity;
    setStock(map);
    setLoading(false);
  }, [addToast, setStock]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async () => {
    const s = sku.trim().toUpperCase();
    const q = parseInt(qty) || 0;
    if (!s) { addToast('Enter a SKU code', 'error'); return; }
    if (q <= 0) { addToast('Quantity must be at least 1', 'error'); return; }
    setSaving(true);
    const existing = rows.find(r => r.sku === s);
    if (existing) {
      const { error } = await supabase.from('virtual_stock').update({ quantity: existing.quantity + q, updated_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) { addToast('Update failed — ' + friendlyError(error), 'error'); setSaving(false); return; }
      addToast(`Added ${q} to ${s} (now ${existing.quantity + q})`, 'success');
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('virtual_stock').insert({ sku: s, quantity: q, created_by: user?.id });
      if (error) { addToast('Save failed — ' + friendlyError(error), 'error'); setSaving(false); return; }
      addToast(`${s}: +${q} added`, 'success');
    }
    setSku(''); setQty(''); setSaving(false); fetch();
  };

  const saveEdit = async (id: string) => {
    const q = parseInt(editQty) || 0;
    if (q < 0) return;
    if (q === 0) { remove(id); return; }
    const { error } = await supabase.from('virtual_stock').update({ quantity: q, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { addToast('Update failed — ' + friendlyError(error), 'error'); return; }
    setEditId(null); setEditQty(''); addToast('Updated', 'success'); fetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('virtual_stock').delete().eq('id', id);
    if (error) { addToast('Delete failed — ' + friendlyError(error), 'error'); return; }
    addToast('Removed', 'success'); fetch();
  };

  const filtered = search ? rows.filter(r => r.sku.toLowerCase().includes(search.toLowerCase())) : rows;

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>Virtual Stock Override {rows.length > 0 && <span style={{ fontSize: 10, color: T.tx3, fontWeight: 400 }}>({rows.length} SKU{rows.length !== 1 ? 's' : ''})</span>}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 1 }}>Manual stock for SKUs showing 0 in vendor sheets. Applies to all exports.</div>
        </div>
        <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: T.tx3, strokeWidth: 2, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s', flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
      </div>

      {expanded && <>
        {/* Add form */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, marginBottom: rows.length > 0 ? 10 : 0 }}>
          <input value={sku} onChange={e => setSku(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="SKU code" style={{ ...S.fInput, flex: 1, fontFamily: T.mono }} />
          <input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') add(); }} placeholder="Qty" style={{ ...S.fInput, width: 80, textAlign: 'right', fontFamily: T.mono }} />
          <div onClick={add} style={{ ...S.btnPrimary, flexShrink: 0, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>Add</div>
        </div>

        {/* Search */}
        {rows.length > 5 && <div style={{ position: 'relative', marginBottom: 8 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU..." style={S.fSearch} />
        </div>}

        {/* List */}
        {loading ? <div style={{ padding: 12, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading...</div> :
        filtered.length === 0 ? (rows.length === 0 ? null : <div style={{ padding: 12, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No matches</div>) :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.01)', border: `1px solid ${T.bd}`, borderRadius: 6 }}>
              <div style={{ flex: 1, fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.tx }}>{r.sku}</div>
              {editId === r.id ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="number" min="0" step="1" value={editQty} onChange={e => setEditQty(e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') saveEdit(r.id); if (e.key === 'Escape') setEditId(null); }} autoFocus style={{ ...S.fInput, width: 60, height: 28, fontSize: 12, textAlign: 'right', fontFamily: T.mono, padding: '4px 8px' }} />
                  <span onClick={() => saveEdit(r.id)} style={{ ...S.btnSm, cursor: 'pointer', color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)', borderRadius: 5, padding: '4px 8px', fontSize: 10 }}>Save</span>
                  <span onClick={() => setEditId(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 13 }}>x</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.gr, minWidth: 30, textAlign: 'right' }}>+{r.quantity}</span>
                  <span onClick={() => { setEditId(r.id); setEditQty(String(r.quantity)); }} style={{ ...S.btnSm, cursor: 'pointer', color: T.ac2, border: '1px solid rgba(99,102,241,.2)', background: 'rgba(99,102,241,.06)', borderRadius: 5, padding: '4px 8px', fontSize: 10 }}>Edit</span>
                  <span onClick={() => remove(r.id)} style={{ ...S.btnSm, cursor: 'pointer', color: T.re, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', borderRadius: 5, padding: '4px 8px', fontSize: 10 }}>Del</span>
                </div>
              )}
            </div>
          ))}
        </div>}
      </>}
    </div>
  );
}
