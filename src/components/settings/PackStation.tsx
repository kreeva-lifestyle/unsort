import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useUndoDelete } from '../../hooks/useUndoDelete';
import Toggle from '../ui/Toggle';
import UndoBar from '../ui/UndoBar';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';

export default function PackStation({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [couriers, setCouriers] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [newCourier, setNewCourier] = useState('');
  const [newSheet, setNewSheet] = useState('');
  const [newCamera, setNewCamera] = useState('');
  const [adding, setAdding] = useState(false);
  const { ask, modalProps } = useConfirm();

  const fetchData = useCallback(() => {
    supabase.from('packtime_couriers').select('id, name, sheet_name, is_active').order('name').then(({ data }) => setCouriers(data || []));
    supabase.from('packtime_cameras').select('id, number, is_active').order('number').then(({ data }) => setCameras(data || []));
  }, []);
  // Table is passed per delete call — a shared state variable here used to be
  // read one render late, sending the first camera delete to the couriers table.
  const { pendingDel, scheduleDelete, undo, dismiss } = useUndoDelete('packtime_couriers', fetchData);
  useEffect(() => { fetchData(); }, [fetchData]);

  const addCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding || !newCourier.trim() || !newSheet.trim()) return;
    if (couriers.some(c => c.name.toLowerCase() === newCourier.trim().toLowerCase())) { addToast('Courier already exists', 'error'); return; }
    setAdding(true);
    const { error } = await supabase.from('packtime_couriers').insert({ name: newCourier.trim(), sheet_name: newSheet.trim() });
    setAdding(false);
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Courier added!', 'success'); setNewCourier(''); setNewSheet(''); fetchData(); }
  };

  const toggleCourier = async (id: string, active: boolean) => {
    if (!active) { const activeCount = couriers.filter(c => c.is_active && c.id !== id).length; if (activeCount < 1) { addToast('At least 1 courier must remain active', 'error'); return; } }
    const { error } = await supabase.from('packtime_couriers').update({ is_active: !active }).eq('id', id);
    if (error) addToast(friendlyError(error), 'error'); else { addToast(active ? 'Courier disabled' : 'Courier enabled', 'success'); fetchData(); }
  };

  const deleteCourier = async (id: string) => {
    if (!await ask({ title: 'Delete courier?', message: 'This courier will be removed.', confirmLabel: 'Delete', danger: true })) return;
    const c = couriers.find(x => x.id === id);
    const { count } = await supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).eq('courier', c?.name);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} scan(s) reference this courier. Disable it instead.`, 'error'); return; }
    setCouriers(prev => prev.filter(x => x.id !== id));
    scheduleDelete(id, 'Courier deleted', 'packtime_couriers');
  };

  const addCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding || !newCamera.trim()) return;
    if (cameras.some(c => String(c.number).trim() === newCamera.trim())) { addToast('Camera already exists', 'error'); return; }
    setAdding(true);
    const { error } = await supabase.from('packtime_cameras').insert({ number: newCamera.trim() });
    setAdding(false);
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Camera added!', 'success'); setNewCamera(''); fetchData(); }
  };

  // Without this, a camera with scan history was stuck forever: PackTime only
  // offers is_active cameras, deletion is blocked once any scan references the
  // number, and there was no way to switch one off.
  const toggleCamera = async (id: string, active: boolean) => {
    if (!active) { const activeCount = cameras.filter(c => c.is_active && c.id !== id).length; if (activeCount < 1) { addToast('At least 1 camera must remain active', 'error'); return; } }
    const { error } = await supabase.from('packtime_cameras').update({ is_active: !active }).eq('id', id);
    if (error) addToast(friendlyError(error), 'error'); else { addToast(active ? 'Camera disabled' : 'Camera enabled', 'success'); fetchData(); }
  };

  const deleteCamera = async (id: string) => {
    if (!await ask({ title: 'Delete camera?', message: 'This camera will be removed.', confirmLabel: 'Delete', danger: true })) return;
    const cam = cameras.find(x => x.id === id);
    const { count } = await supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).eq('camera', cam?.number);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} scan(s) reference this camera. Disable it instead.`, 'error'); return; }
    setCameras(prev => prev.filter(x => x.id !== id));
    scheduleDelete(id, 'Camera deleted', 'packtime_cameras');
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Courier Companies</div>
        <form onSubmit={addCourier} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={newCourier} onChange={e => setNewCourier(e.target.value)} placeholder="Courier name..." style={{ ...S.fInput, flex: 1 }} />
          <input value={newSheet} onChange={e => setNewSheet(e.target.value)} placeholder="Sheet tab name (e.g. Sheet7)" style={{ ...S.fInput, flex: 1 }} />
          <button type="submit" style={S.btnPrimary}>+ Add</button>
        </form>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r }}>
          {couriers.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < couriers.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.is_active ? T.gr : T.tx3, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 9, fontFamily: T.mono, color: T.tx3, background: 'rgba(255,255,255,0.03)', padding: '1px 6px', borderRadius: 3 }}>{c.sheet_name}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Toggle on={c.is_active} onToggle={() => toggleCourier(c.id, c.is_active)} size="sm" />
                <span className="touch44" onClick={() => deleteCourier(c.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
              </div>
            </div>
          ))}
          {couriers.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No couriers configured</div>}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Cameras</div>
        <form onSubmit={addCamera} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={newCamera} onChange={e => setNewCamera(e.target.value)} placeholder="Camera number (e.g. 5)" style={{ ...S.fInput, flex: 1 }} />
          <button type="submit" style={S.btnPrimary}>+ Add</button>
        </form>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r }}>
          {cameras.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < cameras.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.is_active ? T.gr : T.tx3, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontFamily: T.mono, fontWeight: 600, color: T.tx }}>{c.number}</span>
                {!c.is_active && <span style={{ fontSize: 8, color: T.tx3, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.03)' }}>disabled</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Toggle on={c.is_active} onToggle={() => toggleCamera(c.id, c.is_active)} size="sm" />
                <span className="touch44" onClick={() => deleteCamera(c.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
              </div>
            </div>
          ))}
          {cameras.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No cameras configured</div>}
        </div>
      </div>
      {pendingDel && <UndoBar label={pendingDel.label} id={pendingDel.id} onUndo={undo} onDismiss={dismiss} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
