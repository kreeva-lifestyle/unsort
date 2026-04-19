// Locations CRUD — settings sub-page
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

export default function Locations({ addToast, canEdit }: { addToast: (msg: string, type?: string) => void; canEdit: boolean }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [newLoc, setNewLoc] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pendingDel, setPendingDel] = useState<{ id: string; timer: number } | null>(null);

  const fetchLocations = () => { supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || [])); };
  useEffect(() => {
    fetchLocations();
    const ch = supabase.channel('loc-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchLocations).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoc.trim()) return;
    const exists = locations.some(l => l.name.toLowerCase() === newLoc.trim().toLowerCase());
    if (exists) { addToast('Location already exists', 'error'); return; }
    const { error } = await supabase.from('locations').insert({ name: newLoc.trim() });
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Location added!', 'success'); setNewLoc(''); fetchLocations(); }
  };

  const updateLocation = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('locations').update({ name: editName.trim() }).eq('id', id);
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Updated!', 'success'); setEditId(null); fetchLocations(); }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('Delete this location?')) return;
    const loc = locations.find(l => l.id === id);
    const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('location', loc?.name);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} item(s) use this location`, 'error'); return; }
    setLocations(prev => prev.filter(l => l.id !== id));
    if (pendingDel) clearTimeout(pendingDel.timer);
    const timer = window.setTimeout(async () => { await supabase.from('locations').delete().eq('id', id); setPendingDel(null); fetchLocations(); }, 5000);
    setPendingDel({ id, timer });
  };
  const undoDel = () => { if (pendingDel) { clearTimeout(pendingDel.timer); setPendingDel(null); fetchLocations(); } };
  const dismissDel = () => { if (pendingDel) { clearTimeout(pendingDel.timer); supabase.from('locations').delete().eq('id', pendingDel.id).then(() => fetchLocations()); setPendingDel(null); } };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Locations</span>
      </div>
      {canEdit && <form onSubmit={addLocation} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Add new location..." style={{ ...S.fInput, flex: 1 }} />
        <button type="submit" style={S.btnPrimary}>+ Add</button>
      </form>}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r }}>
        {locations.map((loc, i) => (
          <div key={loc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < locations.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
            {editId === loc.id ? (
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') updateLocation(loc.id); if (e.key === 'Escape') setEditId(null); }} style={{ ...S.fInput, flex: 1 }} autoFocus />
                <span onClick={() => updateLocation(loc.id)} style={S.btnPrimary}>Save</span>
                <span onClick={() => setEditId(null)} style={S.btnGhost}>Cancel</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>📍</span>
                  <span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{loc.name}</span>
                </div>
                {canEdit && <div style={{ display: 'flex', gap: 4 }}>
                  <span onClick={() => { setEditId(loc.id); setEditName(loc.name); }} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</span>
                  <span onClick={() => deleteLocation(loc.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
                </div>}
              </>
            )}
          </div>
        ))}
        {locations.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No locations yet. Add your first location above.</div>}
      </div>
      {pendingDel && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease', overflow: 'hidden', minWidth: 260 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>Location deleted</span>
          <span onClick={undoDel} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: T.yl, color: '#000' }}>Undo</span>
          <span onClick={dismissDel} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>✕</span>
        </div>
        <div className="undo-bar" key={pendingDel.id} />
      </div>}
    </div>
  );
}
