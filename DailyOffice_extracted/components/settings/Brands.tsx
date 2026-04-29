// Brands directory CRUD — settings sub-page
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';

export default function Brands({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [brands, setBrands] = useState<any[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [pendingDel, setPendingDel] = useState<{ id: string; timer: number } | null>(null);
  const fetchBrands = () => { supabase.from('brands').select('*').order('name').then(({ data }) => setBrands(data || [])); };
  useEffect(() => { fetchBrands(); }, []);
  const addBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim()) return;
    const exists = brands.some(b => b.name.toLowerCase() === newBrand.trim().toLowerCase());
    if (exists) { addToast('Brand already exists', 'error'); return; }
    const { error } = await supabase.from('brands').insert({ name: newBrand.trim().toUpperCase() });
    if (error) addToast(error.message, 'error');
    else { addToast('Brand added!', 'success'); setNewBrand(''); fetchBrands(); }
  };
  const toggleBrand = async (id: string, active: boolean) => { const { error } = await supabase.from('brands').update({ is_active: !active }).eq('id', id); if (error) addToast(error.message, 'error'); else fetchBrands(); };
  const deleteBrand = async (id: string) => {
    if (!confirm('Delete this brand?')) return;
    const b = brands.find(x => x.id === id);
    const { count } = await supabase.from('packtime_couriers').select('id', { count: 'exact', head: true }).eq('brand', b?.name);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} courier(s) use this brand`, 'error'); return; }
    setBrands(prev => prev.filter(x => x.id !== id));
    if (pendingDel) clearTimeout(pendingDel.timer);
    const timer = window.setTimeout(async () => { await supabase.from('brands').delete().eq('id', id); setPendingDel(null); fetchBrands(); }, 5000);
    setPendingDel({ id, timer });
  };
  const undoDel = () => { if (pendingDel) { clearTimeout(pendingDel.timer); setPendingDel(null); fetchBrands(); } };
  const dismissDel = () => { if (pendingDel) { clearTimeout(pendingDel.timer); supabase.from('brands').delete().eq('id', pendingDel.id).then(() => fetchBrands()); setPendingDel(null); } };
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
      {pendingDel && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease', overflow: 'hidden', minWidth: 260 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 12, color: T.tx, flex: 1 }}>Brand deleted</span><span onClick={undoDel} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: T.yl, color: '#000' }}>Undo</span><span onClick={dismissDel} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>✕</span></div>
        <div className="undo-bar" key={pendingDel.id} />
      </div>}
    </div>
  );
}
