// Categories (products + components) CRUD — settings sub-page
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

export default function Categories({ addToast, profile }: { addToast: (msg: string, type?: string) => void; profile: any }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const [form, setForm] = useState({ sku: '', name: '', description: '', category: '' });
  const [newComps, setNewComps] = useState<string[]>(['']);

  const fetchCategories = () => { supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }).then(({ data }) => setCategories(data || [])); };
  useEffect(() => {
    fetchCategories();
    const ch = supabase.channel('cat-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchCategories)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'components' }, fetchCategories)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const fetchComps = async (id: string) => { const { data } = await supabase.from('components').select('*').eq('product_id', id).order('created_at', { ascending: true }); setComps(data || []); };

  const generateSku = (name: string) => {
    const base = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const ts = Date.now().toString(36).slice(-4).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `${base}-${ts}${rand}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      if (selected.name !== form.name) {
        const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('product_id', selected.id);
        if ((count || 0) > 0 && !confirm(`${count} item(s) use this category. Renaming will affect all. Continue?`)) return;
      }
      const { error } = await supabase.from('products').update({ name: form.name, description: form.description, category: form.category }).eq('id', selected.id);
      if (error) { addToast(friendlyError(error), 'error'); return; }
      const validComps = newComps.filter(c => c.trim());
      if (validComps.length > 0) {
        const compsToInsert = validComps.map((name, i) => ({ product_id: selected.id, name: name.trim(), component_code: `C${(comps.length || 0) + i + 1}` }));
        const { error: compsErr } = await supabase.from('components').insert(compsToInsert);
        if (compsErr) { addToast('Component add failed — ' + friendlyError(compsErr), 'error'); return; }
      }
      addToast('Updated!', 'success');
    } else {
      const validComps = newComps.filter(c => c.trim());
      if (validComps.length === 0) { addToast('Add at least 1 component', 'error'); return; }
      const sku = generateSku(form.name);
      const { data, error } = await supabase.from('products').insert({ sku, name: form.name, description: form.description, category: form.category, created_by: profile?.id, total_components: validComps.length }).select().single();
      if (error || !data) { addToast(error ? friendlyError(error) : 'Save failed', 'error'); return; }
      if (validComps.length > 0) {
        const compsToInsert = validComps.map((name, i) => ({ product_id: data.id, name: name.trim(), component_code: `C${i + 1}` }));
        const { error: compsErr } = await supabase.from('components').insert(compsToInsert);
        if (compsErr) { addToast('Component add failed — ' + friendlyError(compsErr), 'error'); return; }
      }
      addToast(`Category "${form.name}" added with ${validComps.length} components!`, 'success');
    }
    setShowModal(false); setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); fetchCategories();
  };

  const addCompRow = () => setNewComps([...newComps, '']);
  const removeCompRow = (i: number) => setNewComps(newComps.filter((_, idx) => idx !== i));
  const updateCompRow = (i: number, val: string) => { const c = [...newComps]; c[i] = val; setNewComps(c); };

  const checkCategoryInUse = async (productId: string) => {
    const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('product_id', productId);
    return (count || 0) > 0;
  };

  const addCompToExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    const validComps = newComps.filter(c => c.trim());
    if (validComps.length === 0) return;
    if (await checkCategoryInUse(selected.id)) { addToast('Cannot modify components — inventory items use this category. Delink items first.', 'error'); return; }
    const compsToInsert = validComps.map((name, i) => ({ product_id: selected.id, name: name.trim(), component_code: `C${(comps.length || 0) + i + 1}` }));
    const { error } = await supabase.from('components').insert(compsToInsert);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    // total_components is auto-maintained by trigger_update_component_count
    addToast(`${validComps.length} component(s) added!`, 'success');
    setNewComps(['']); fetchComps(selected.id); fetchCategories();
  };

  const deleteComp = async (id: string) => {
    if (await checkCategoryInUse(selected.id)) { addToast('Cannot delete component — inventory items use this category. Delink items first.', 'error'); return; }
    const { count: compCount } = await supabase.from('components').select('id', { count: 'exact', head: true }).eq('product_id', selected.id);
    if ((compCount || 0) <= 1) { addToast('Cannot delete — category must have at least 1 component', 'error'); return; }
    const [{ count: itemCount }, { count: extraCount }] = await Promise.all([
      supabase.from('item_components').select('id', { count: 'exact', head: true }).eq('component_id', id),
      supabase.from('inventory_extras').select('id', { count: 'exact', head: true }).eq('component_id', id),
    ]);
    const refs = (itemCount || 0) + (extraCount || 0);
    if (refs > 0) { addToast(`Cannot delete — used by ${itemCount || 0} item(s) and ${extraCount || 0} extra(s)`, 'error'); return; }
    const { error: delErr } = await supabase.from('components').delete().eq('id', id);
    if (delErr) { addToast('Delete failed — ' + friendlyError(delErr), 'error'); return; }
    // total_components is auto-maintained by trigger_update_component_count
    addToast('Deleted!', 'success'); fetchComps(selected.id); fetchCategories();
  };

  const openEdit = async (p: any) => { setSelected(p); setForm({ sku: p.sku || '', name: p.name, description: p.description || '', category: p.category || '' }); setNewComps(['']); await fetchComps(p.id); setShowModal(true); };
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const compInputRow = (val: string, i: number, total: number, offset = 0) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{offset + i + 1}</span>
      <input value={val} onChange={(e) => updateCompRow(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) addCompRow(); } }} placeholder="Component name" style={{ ...S.fInput, flex: 1 }} />
      {total > 1 && <span onClick={() => removeCompRow(i)} style={{ cursor: 'pointer', color: T.re, fontSize: 16, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>✕</span>}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Categories</span>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); setShowModal(true); }} style={S.btnPrimary}>+ Add</div>}</div>
      <div className="cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>{categories.map((p) => (<div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '14px 16px', transition: 'border-color .15s, box-shadow .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.bd2; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.2)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.boxShadow = 'none'; }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div><h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.tx }}>{p.name}</h3><span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac2 }}>{p.sku}</span></div>
          {canEdit && <span onClick={() => openEdit(p)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</span>}
        </div>
        {p.description && <p style={{ color: T.tx3, fontSize: 11, margin: '0 0 10px' }}>{p.description}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0', borderTop: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>{p.total_components} component{p.total_components !== 1 ? 's' : ''}</span>
        </div>
      </div>))}</div>
      {categories.length === 0 && <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 36, textAlign: 'center' }}><p style={{ color: T.tx3, fontSize: 12, marginBottom: 6 }}>No categories yet</p><p style={{ color: T.tx3, fontSize: 10 }}>Add a category like "Lehenga Choli" with components like Lehenga, Blouse, Dupatta</p>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); setShowModal(true); }} style={{ ...S.btnPrimary, marginTop: 12, display: 'inline-flex' }}>+ Add First Category</div>}</div>}

      {showModal && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 480 }}><div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Category</span></div><form onSubmit={handleSubmit} style={{ padding: 16 }}>
        <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Category name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Lehenga Choli" style={S.fInput} /></div>
        <div style={{ marginBottom: 12 }}><label style={S.fLabel}>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description (optional)" style={S.fInput} /></div>
        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ ...S.fLabel, margin: 0 }}>Components</label><span onClick={addCompRow} style={{ ...S.btnPrimary, ...S.btnSm }}>+ Add More</span></div>
        {selected && comps.length > 0 && <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 8, marginBottom: 8 }}>
          {comps.map((c: any, i: number) => (<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, marginBottom: 3, background: 'transparent', border: `1px solid ${T.bd}` }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{c.name}</span>
            {canEdit && <span onClick={() => deleteComp(c.id)} style={{ ...S.btnDanger, ...S.btnSm, cursor: 'pointer' }}>Delete</span>}
          </div>))}
        </div>}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 10, marginBottom: 12 }}>
          {newComps.map((c, i) => compInputRow(c, i, newComps.length, selected ? comps.length : 0))}
        </div>
        <div style={{ padding: '12px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 7 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add Category'}</button></div>
      </form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 500 }}><div style={S.modalHead}><div><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Components of "{selected.name}"</span><p style={{ margin: '3px 0 0', fontSize: 10, color: T.tx3 }}>Manage the individual parts of this category</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><div style={{ padding: 16 }}>
        {canEdit && <form onSubmit={addCompToExisting} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, padding: 12, borderRadius: T.r, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, margin: 0 }}>Add Components</p><span onClick={addCompRow} style={{ fontSize: 10, color: T.ac, cursor: 'pointer' }}>+ Add More</span></div>
          {newComps.map((c, i) => compInputRow(c, i, newComps.length))}
          <button type="submit" style={{ ...S.btnPrimary, marginTop: 4 }}>+ Add Component{newComps.filter(c => c.trim()).length > 1 ? 's' : ''}</button>
        </form>}
        {comps.length > 0 && <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>{comps.length} Component{comps.length !== 1 ? 's' : ''}</p>}
        {comps.map((c, i) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: `1px solid ${T.bd}`, borderRadius: 6, marginBottom: 5, background: 'rgba(255,255,255,0.02)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: T.tx3, fontFamily: T.mono }}>{i + 1}</span><span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{c.name}</span></div>{canEdit && <span onClick={() => deleteComp(c.id)} style={S.btnDanger}>Delete</span>}</div>))}
        {comps.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: T.tx3 }}><p style={{ fontSize: 11 }}>No components yet</p></div>}
      </div></div></div>)}
    </div>
  );
}
