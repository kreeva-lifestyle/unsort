// PackStation settings — couriers + cameras CRUD
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';

export default function PackStation({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [couriers, setCouriers] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [newCourier, setNewCourier] = useState('');
  const [newSheet, setNewSheet] = useState('');
  const [pendingDel, setPendingDel] = useState<{ id: string; type: string; timer: number } | null>(null);
  const [newCamera, setNewCamera] = useState('');

  const fetchData = () => {
    supabase.from('packtime_couriers').select('*').order('name').then(({ data }) => setCouriers(data || []));
    supabase.from('packtime_cameras').select('*').order('number').then(({ data }) => setCameras(data || []));
  };
  useEffect(() => { fetchData(); }, []);

  const addCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourier.trim() || !newSheet.trim()) return;
    const exists = couriers.some(c => c.name.toLowerCase() === newCourier.trim().toLowerCase());
    if (exists) { addToast('Courier already exists', 'error'); return; }
    const { error } = await supabase.from('packtime_couriers').insert({ name: newCourier.trim(), sheet_name: newSheet.trim() });
    if (error) addToast(error.message, 'error');
    else { addToast('Courier added!', 'success'); setNewCourier(''); setNewSheet(''); fetchData(); }
  };

  const toggleCourier = async (id: string, active: boolean) => {
    if (!active) { const activeCount = couriers.filter(c => c.is_active && c.id !== id).length; if (activeCount < 1) { addToast('At least 1 courier must remain active', 'error'); return; } }
    const { error } = await supabase.from('packtime_couriers').update({ is_active: !active }).eq('id', id);
    if (error) addToast(error.message, 'error'); else fetchData();
  };

  const deleteCourier = async (id: string) => {
    if (!confirm('Delete this courier?')) return;
    const c = couriers.find(x => x.id === id);
    const { count } = await supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).eq('courier', c?.name);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} scan(s) reference this courier`, 'error'); return; }
    setCouriers(prev => prev.filter(x => x.id !== id));
    if (pendingDel) clearTimeout(pendingDel.timer);
    const timer = window.setTimeout(async () => { await supabase.from('packtime_couriers').delete().eq('id', id); setPendingDel(null); fetchData(); }, 5000);
    setPendingDel({ id, type: 'Courier', timer });
  };

  const addCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCamera.trim()) return;
    const { error } = await supabase.from('packtime_cameras').insert({ number: newCamera.trim() });
    if (error) addToast(error.message, 'error');
    else { addToast('Camera added!', 'success'); setNewCamera(''); fetchData(); }
  };

  const deleteCamera = async (id: string) => {
    if (!confirm('Delete this camera?')) return;
    const cam = cameras.find(x => x.id === id);
    const { count } = await supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).eq('camera', cam?.number);
    if ((count || 0) > 0) { addToast(`Cannot delete — ${count} scan(s) reference this camera`, 'error'); return; }
    setCameras(prev => prev.filter(x => x.id !== id));
    if (pendingDel) clearTimeout(pendingDel.timer);
    const timer = window.setTimeout(async () => { await supabase.from('packtime_cameras').delete().eq('id', id); setPendingDel(null); fetchData(); }, 5000);
    setPendingDel({ id, type: 'Camera', timer });
  };
  const undoDel = () => { if (pendingDel) { clearTimeout(pendingDel.timer); setPendingDel(null); fetchData(); } };
  const dismissDel = () => { if (pendingDel) { clearTimeout(pendingDel.timer); const table = pendingDel.type === 'Courier' ? 'packtime_couriers' : 'packtime_cameras'; supabase.from(table).delete().eq('id', pendingDel.id).then(() => fetchData()); setPendingDel(null); } };

  return (
    <div>
      {/* Couriers */}
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
                <span onClick={() => toggleCourier(c.id, c.is_active)} style={{ ...S.btnGhost, ...S.btnSm, color: c.is_active ? T.yl : T.gr }}>{c.is_active ? 'Disable' : 'Enable'}</span>
                <span onClick={() => deleteCourier(c.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
              </div>
            </div>
          ))}
          {couriers.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No couriers configured</div>}
        </div>
      </div>

      {/* Cameras */}
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
                <span style={{ fontSize: 14, fontFamily: T.mono, fontWeight: 600, color: T.tx }}>{c.number}</span>
                {!c.is_active && <span style={{ fontSize: 8, color: T.tx3, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.03)' }}>disabled</span>}
              </div>
              <span onClick={() => deleteCamera(c.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
            </div>
          ))}
          {cameras.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No cameras configured</div>}
        </div>
      </div>
      {pendingDel && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease', overflow: 'hidden', minWidth: 260 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{pendingDel.type} deleted</span><span onClick={undoDel} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: T.yl, color: '#000' }}>Undo</span><span onClick={dismissDel} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>✕</span></div>
        <div className="undo-bar" key={pendingDel.id} />
      </div>}
    </div>
  );
}
