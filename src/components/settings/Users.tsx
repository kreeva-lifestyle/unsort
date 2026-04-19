// Users management — settings sub-page (includes admin user directory + personal PIN/phone)
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

export default function Users({ addToast, profile }: { addToast: (msg: string, type?: string) => void; profile: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', password: '', role: 'viewer' });
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null);
  const [pinExists, setPinExists] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [myPhone, setMyPhone] = useState('');
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const loadPin = useCallback(async () => {
    if (!profile?.id) return;
    const { data: pin } = await supabase.rpc('get_own_pin');
    setPinExists(!!pin);
    const { data: prof } = await supabase.from('profiles').select('phone').eq('id', profile.id).maybeSingle();
    setMyPhone(prof?.phone || '');
  }, [profile?.id]);

  useEffect(() => { loadPin(); }, [loadPin]);

  const savePhone = async () => {
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length !== 10) { addToast('Phone must be 10 digits', 'error'); return; }
    setPhoneSaving(true);
    const { error } = await supabase.from('profiles').update({ phone: cleaned }).eq('id', profile.id);
    setPhoneSaving(false);
    if (error) { addToast('Save failed — ' + friendlyError(error), 'error'); return; }
    setMyPhone(cleaned);
    setPhoneEditing(false);
    addToast('Phone saved', 'success');
  };

  const saveMyPin = async () => {
    setPinError('');
    if (newPin.length < 4 || newPin.length > 6) { setPinError('PIN must be 4-6 digits'); return; }
    if (!/^\d+$/.test(newPin)) { setPinError('PIN must be digits only'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
    setPinSaving(true);
    const { error } = await supabase.from('profiles').update({ cash_pin: newPin }).eq('id', profile.id);
    setPinSaving(false);
    if (error) { setPinError('Save failed — ' + friendlyError(error)); return; }
    setNewPin(''); setConfirmPin(''); setEditingPin(false);
    await loadPin();
    addToast('Cash PIN saved successfully', 'success');
  };

  const removePin = async () => {
    if (!confirm('Remove your Cash PIN? You will not be able to confirm cash handovers without it.')) return;
    await supabase.from('profiles').update({ cash_pin: null }).eq('id', profile.id);
    await loadPin();
    addToast('Cash PIN removed', 'success');
  };

  const fetchUsers = () => { supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at').order('created_at', { ascending: false }).then(({ data }) => setUsers(data || [])); };
  useEffect(() => {
    fetchUsers();
    const ch = supabase.channel('usr-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const updateRole = async (id: string, role: string) => {
    const u = users.find(x => x.id === id);
    if (!confirm(`Change ${u?.full_name || 'user'} role to "${role}"?`)) { fetchUsers(); return; }
    if (u?.role === 'admin' && role !== 'admin') {
      const adminCount = users.filter(x => x.role === 'admin' && x.is_active && x.id !== id).length;
      if (adminCount < 1) { addToast('Cannot demote — at least 1 admin must remain', 'error'); fetchUsers(); return; }
    }
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) addToast('Role change failed — ' + friendlyError(error), 'error'); else { addToast('Role updated!', 'success'); fetchUsers(); }
  };
  const toggleActive = async (id: string, isActive: boolean) => {
    if (isActive) {
      const u = users.find(x => x.id === id);
      if (u?.role === 'admin') {
        const adminCount = users.filter(x => x.role === 'admin' && x.is_active && x.id !== id).length;
        if (adminCount < 1) { addToast('Cannot deactivate — last active admin', 'error'); return; }
      }
    }
    const { error } = await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id);
    if (error) addToast(friendlyError(error), 'error'); else { addToast(isActive ? 'Access revoked' : 'Access granted', 'success'); fetchUsers(); }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    const password = inviteForm.password || generatePassword();
    const { data, error } = await supabase.auth.signUp({
      email: inviteForm.email,
      password,
      options: { data: { full_name: inviteForm.full_name } }
    });
    if (error) {
      addToast(friendlyError(error), 'error');
      setInviting(false);
      return;
    }
    // Auto-confirm email + update role
    if (data.user) {
      await supabase.rpc('confirm_user_email', { target_user_id: data.user.id });
      if (inviteForm.role !== 'viewer') {
        await supabase.from('profiles').update({ role: inviteForm.role }).eq('id', data.user.id);
      }
    }
    setInviteResult({ email: inviteForm.email, password });
    setTimeout(() => setInviteResult(null), 15000);
    addToast(`User ${inviteForm.full_name} invited!`, 'success');
    setInviting(false);
    fetchUsers();
  };

  const closeInvite = () => {
    setShowInvite(false);
    setInviteResult(null);
    setInviteForm({ email: '', full_name: '', password: '', role: 'viewer' });
  };

  return (
    <div>
      {/* My Phone — required for WhatsApp notifications */}
      <div style={{ background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.gr, fontFamily: T.sora }}>My Phone Number</div>
          {!phoneEditing && (myPhone.length === 10 ? (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: T.gr, fontWeight: 700, textTransform: 'uppercase' }}>✓ Saved</span>
          ) : (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>Required</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Required to receive WhatsApp notifications for cash handovers and payment alerts.</div>

        {!phoneEditing ? (
          // Read-only display + Edit button
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {myPhone.length === 10 ? (
              <span style={{ fontFamily: T.mono, fontSize: 16, color: T.tx, fontWeight: 600, letterSpacing: 1 }}>+91 {myPhone.slice(0, 5)} {myPhone.slice(5)}</span>
            ) : (
              <span style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' }}>No phone number saved</span>
            )}
            <button onClick={() => { setPhoneInput(myPhone); setPhoneEditing(true); }} style={S.btnPrimary}>{myPhone.length === 10 ? 'Edit' : 'Add Phone'}</button>
          </div>
        ) : (
          // Edit mode: input + Save + Cancel
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="tel" inputMode="numeric" value={phoneInput} onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" autoFocus style={{ ...S.fInput, fontFamily: T.mono, flex: 1, maxWidth: 220, fontSize: 13 }} />
            <button onClick={savePhone} disabled={phoneSaving} style={{ ...S.btnPrimary, opacity: phoneSaving ? 0.6 : 1 }}>{phoneSaving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => { setPhoneEditing(false); setPhoneInput(''); }} style={S.btnGhost}>Cancel</button>
          </div>
        )}
      </div>

      {/* My Cash PIN — for confirming cash handovers */}
      <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.yl, fontFamily: T.sora }}>My Cash PIN</div>
          {!editingPin && (pinExists ? (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: T.gr, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>✓ Saved</span>
          ) : (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Not Set</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Required to sign cash handovers received from accountant. 4-6 digits.</div>

        {!editingPin ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {pinExists ? (
              <span style={{ fontFamily: T.mono, fontSize: 16, color: T.tx, fontWeight: 600, letterSpacing: 6 }}>{'•••••'}</span>
            ) : (
              <span style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' }}>No PIN configured</span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setEditingPin(true); setNewPin(''); setConfirmPin(''); setPinError(''); }} style={S.btnPrimary}>{pinExists ? 'Edit' : 'Set PIN'}</button>
              {pinExists && <button onClick={removePin} style={S.btnDanger}>Remove</button>}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ ...S.fLabel, marginBottom: 3 }}>{pinExists ? 'New PIN' : 'PIN'}</label>
                <input type="password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" autoFocus style={{ ...S.fInput, fontFamily: T.mono, letterSpacing: 4, textAlign: 'center', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ ...S.fLabel, marginBottom: 3 }}>Confirm PIN</label>
                <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" style={{ ...S.fInput, fontFamily: T.mono, letterSpacing: 4, textAlign: 'center', fontSize: 14 }} />
              </div>
            </div>
            {pinError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '5px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{pinError}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={saveMyPin} disabled={pinSaving} style={{ ...S.btnPrimary, opacity: pinSaving ? 0.6 : 1 }}>{pinSaving ? 'Saving...' : 'Save PIN'}</button>
              <button onClick={() => { setEditingPin(false); setNewPin(''); setConfirmPin(''); setPinError(''); }} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Users</span>
        <div onClick={() => setShowInvite(true)} style={S.btnPrimary}>+ Invite User</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.015)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={S.tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
                  <div><p style={{ margin: 0, fontWeight: 600, fontSize: 11, color: T.tx }}>{u.full_name || 'Unnamed'}</p><p style={{ margin: '1px 0 0', fontSize: 10, color: T.tx3 }}>{u.email}</p></div>
                </div>
              </td>
              <td style={S.tdStyle}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ ...S.fInput, width: 'auto', minWidth: 90, padding: '4px 8px', cursor: u.id === profile?.id ? 'not-allowed' : 'pointer', opacity: u.id === profile?.id ? 0.5 : 1, fontSize: 10 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td>
              <td style={S.tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, ...(u.is_active ? { background: 'rgba(45,212,160,.10)', color: T.gr } : { background: 'rgba(245,87,92,.10)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
              <td style={S.tdStyle}>{u.id !== profile?.id && <span onClick={() => toggleActive(u.id, u.is_active)} style={{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: T.sans, display: 'inline-block', ...(u.is_active ? { background: 'rgba(245,87,92,.08)', color: T.re, border: '1px solid rgba(245,87,92,.18)' } : { background: 'rgba(45,212,160,.08)', color: T.gr, border: '1px solid rgba(45,212,160,.18)' }) }}>{u.is_active ? 'Revoke' : 'Grant'}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {showInvite && (<div style={S.modalOverlay}><div className="modal-inner" style={S.modalBox}>
        <div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Invite New User</span></div>
        {inviteResult ? (
          <div style={{ padding: 16 }}>
            <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.18)', borderRadius: T.r, padding: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: T.gr, margin: '0 0 4px' }}>User invited successfully!</p>
              <p style={{ fontSize: 10, color: T.tx2, margin: 0 }}>Share these credentials with the user:</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 }}>Email</p>
                <p style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, margin: 0, userSelect: 'all' as const }}>{inviteResult.email}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 }}>Password</p>
                <p style={{ fontSize: 12, fontFamily: T.mono, color: T.ac, margin: 0, userSelect: 'all' as const }}>{inviteResult.password}</p>
              </div>
            </div>
            <p style={{ fontSize: 10, color: T.tx3, marginTop: 10, textAlign: 'center' }}>The user should change their password after first login</p>
            <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
              <div onClick={closeInvite} style={S.btnPrimary}>Done</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} style={{ padding: 16 }}>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Full Name *</label><input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} required placeholder="e.g. Mahesh Dhameliya" style={S.fInput} /></div>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Email *</label><input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required placeholder="user@aryadesigns.co.in" style={S.fInput} /></div>
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div><label style={S.fLabel}>Password</label><input value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="Auto-generate if empty" style={S.fInput} /></div>
              <div><label style={S.fLabel}>Role</label><select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} style={S.fInput}><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
            </div>
            <div style={{ background: 'rgba(99,102,241,.05)', border: `1px solid rgba(99,102,241,.15)`, borderRadius: T.r, padding: '8px 12px', fontSize: 10, color: T.ac2, marginBottom: 12 }}>The user will be created with the credentials above. Share the email and password with them so they can sign in.</div>
            <div style={{ padding: '12px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
              <span onClick={closeInvite} style={S.btnGhost}>Cancel</span>
              <button type="submit" disabled={inviting} style={S.btnPrimary}>{inviting ? 'Creating...' : 'Create & Invite'}</button>
            </div>
          </form>
        )}
      </div></div>)}
    </div>
  );
}
