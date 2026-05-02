import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useUndoDelete } from '../../hooks/useUndoDelete';
import UndoBar from '../ui/UndoBar';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';

export default function Brands({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [brands, setBrands] = useState<any[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const { ask, modalProps } = useConfirm();
  const fetchBrands = useCallback(() => { supabase.from('brands').select('id, name, is_active').order('name').then(({ data }) => setBrands(data || [])); }, []);
  const { pendingDel, scheduleDelete, undo, dismiss } = useUndoDelete('brands', fetchBrands);
  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const addBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim()) return;
    if (brands.some(b => b.name.toLowerCase() === newBrand.trim().toLowerCase())) { addToast('Brand already exists', 'error'); return; }
    const { error } = await supabase.from('brands').insert({ name: newBrand.trim().toUpperCase() });
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Brand added!', 'success'); setNewBrand(''); fetchBrands(); }
  };
  const toggleBrand = async (id: string, active: boolean) => { const { error } = await supabase.from('brands').update({ is_active: !active }).eq('id', id); if (error) addToast(friendlyError(error), 'error'); else fetchBrands(); };
  const deleteBrand = async (id: string) => {
    if (!await ask({ title: 'Delete brand?', message: 'This brand will be removed.', confirmLabel: 'Delete', danger: true })) return;
    const b = brands.find(x => x.id === id);
    const { count } = await supabase.from('packtime_couriers').select('id', { count: 'exact', head: true }).eq('brand', b?.name);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} courier(s) use this brand`, 'error'); return; }
    setBrands(prev => prev.filter(x => x.id !== id));
    scheduleDelete(id, 'Brand deleted');
  };

  return (
    <div>
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: T.tx }}>Brands</h3>
      <form onSubmit={addBrand} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input value={newBrand} onChange={e => setNewBrand(e.target.value)} placeholder="Brand name (e.g. TANUKA)" style={{ ...S.fInput, flex: 1 }} />
        <button type="submit" style={S.btnPrimary}>+ Add</button>
      </form>
      {brands.map(b => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.bd}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.is_active ? T.gr : T.tx3 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{b.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span onClick={() => toggleBrand(b.id, b.is_active)} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer' }}>{b.is_active ? 'Disable' : 'Enable'}</span>
            <span onClick={() => deleteBrand(b.id)} style={{ ...S.btnDanger, cursor: 'pointer' }}>Delete</span>
          </div>
        </div>
      ))}
      {brands.length === 0 && <div style={{ fontSize: 11, color: T.tx3, padding: 10 }}>No brands. Add one above.</div>}
      {pendingDel && <UndoBar label={pendingDel.label} id={pendingDel.id} onUndo={undo} onDismiss={dismiss} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
