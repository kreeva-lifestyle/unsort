import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useUndoDelete } from '../../hooks/useUndoDelete';
import UndoBar from '../ui/UndoBar';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';

export default function Locations({ addToast, canEdit }: { addToast: (msg: string, type?: string) => void; canEdit: boolean }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [newLoc, setNewLoc] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const { ask, modalProps } = useConfirm();
  const fetchLocations = useCallback(() => { supabase.from('locations').select('id, name').order('name').then(({ data }) => setLocations(data || [])); }, []);
  const { pendingDel, scheduleDelete, undo, dismiss } = useUndoDelete('locations', fetchLocations);

  useEffect(() => {
    fetchLocations();
    const ch = supabase.channel('loc-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchLocations).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchLocations]);

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoc.trim()) return;
    if (locations.some(l => l.name.toLowerCase() === newLoc.trim().toLowerCase())) { addToast('Location already exists', 'error'); return; }
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
    if (!await ask({ title: 'Delete location?', message: 'This location will be removed.', confirmLabel: 'Delete', danger: true })) return;
    const loc = locations.find(l => l.id === id);
    const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('location', loc?.name);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} item(s) use this location`, 'error'); return; }
    setLocations(prev => prev.filter(l => l.id !== id));
    scheduleDelete(id, 'Location deleted');
  };

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
      {pendingDel && <UndoBar label={pendingDel.label} id={pendingDel.id} onUndo={undo} onDismiss={dismiss} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
