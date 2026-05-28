// Users management — admin-only user directory, role edits, invites.
// Personal settings (Phone + Cash PIN) moved to MyProfile.tsx so non-admins
// can still set their own PIN for cash handover confirmation.
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Toggle from '../ui/Toggle';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { MODULE_LABELS, ALL_MODULE_KEYS } from '../../lib/tabs';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';

export default function Users({ addToast, profile }: { addToast: (msg: string, type?: string) => void; profile: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', password: '', role: 'viewer' });
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null);
  const { ask, modalProps } = useConfirm();

  useEffect(() => {
    document.body.classList.toggle('modal-open', showInvite);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showInvite]);

  const fetchUsers = () => { supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at, module_access').order('created_at', { ascending: false }).then(({ data, error }) => { if (error) addToast('Failed to load users — ' + friendlyError(error), 'error'); setUsers(data || []); }); };
  useEffect(() => {
    fetchUsers();
    const ch = supabase.channel('usr-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const updateRole = async (id: string, role: string) => {
    const u = users.find(x => x.id === id);
    if (!await ask({ title: 'Change role?', message: `Change ${u?.full_name || 'user'} role to "${role}".`, confirmLabel: 'Change' })) { fetchUsers(); return; }
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

  const toggleModule = async (userId: string, modKey: string) => {
    const { data: fresh } = await supabase.from('profiles').select('module_access').eq('id', userId).maybeSingle();
    const access = { ...( fresh?.module_access || Object.fromEntries(ALL_MODULE_KEYS.map(k => [k, true])) ) };
    access[modKey] = !access[modKey];
    const { error } = await supabase.from('profiles').update({ module_access: access }).eq('id', userId);
    if (error) addToast('Failed to update access — ' + friendlyError(error), 'error');
    else fetchUsers();
  };

  const ModuleChips = ({ u }: { u: any }) => {
    if (u.role === 'admin') return null;
    const access: Record<string, boolean> = u.module_access || Object.fromEntries(ALL_MODULE_KEYS.map(k => [k, true]));
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
        {ALL_MODULE_KEYS.map(k => {
          const on = access[k] !== false;
          return (
            <span key={k} onClick={() => toggleModule(u.id, k)}
              style={{ padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', userSelect: 'none',
                background: on ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${on ? 'rgba(34,197,94,.2)' : T.bd}`,
                color: on ? T.gr : T.tx3, opacity: on ? 1 : 0.5 }}>
              {on ? '✓' : '✗'} {MODULE_LABELS[k]}
            </span>
          );
        })}
      </div>
    );
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || profile.role !== 'admin') { addToast('Only admins can invite users', 'error'); return; }
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
      const { error: confErr } = await supabase.rpc('confirm_user_email', { target_user_id: data.user.id });
      if (confErr) addToast('User created but email auto-confirmation failed — they may need to confirm via email link first.', 'error');
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div onClick={() => setShowInvite(true)} style={S.btnPrimary}>+ Invite User</div>
      </div>
      <div className="desktop-only" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{users.map((u) => (
            <React.Fragment key={u.id}>
            <tr style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.015)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={S.tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
                  <div><p style={{ margin: 0, fontWeight: 600, fontSize: 11, color: T.tx }}>{u.full_name || 'Unnamed'}</p><p style={{ margin: '1px 0 0', fontSize: 10, color: T.tx3 }}>{u.email}</p></div>
                </div>
              </td>
              <td style={S.tdStyle}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ ...S.fInput, width: 'auto', minWidth: 90, padding: '4px 8px', cursor: u.id === profile?.id ? 'not-allowed' : 'pointer', opacity: u.id === profile?.id ? 0.5 : 1, fontSize: 10 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td>
              <td style={S.tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, ...(u.is_active ? { background: 'rgba(45,212,160,.10)', color: T.gr } : { background: 'rgba(245,87,92,.10)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
              <td style={S.tdStyle}>{u.id !== profile?.id && <Toggle on={u.is_active} onToggle={() => toggleActive(u.id, u.is_active)} size="sm" />}</td>
            </tr>
            {u.role !== 'admin' && <tr><td colSpan={4} style={{ padding: '0 14px 10px' }}><ModuleChips u={u} /></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table>
      </div>
      {/* Mobile card view */}
      <div className="mobile-only" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
        {users.map((u) => (
          <div key={u.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: T.tx }}>{u.full_name || 'Unnamed'}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, ...(u.is_active ? { background: 'rgba(45,212,160,.10)', color: T.gr } : { background: 'rgba(245,87,92,.10)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${T.bd}` }}>
              <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '6px 10px', outline: 'none', cursor: u.id === profile?.id ? 'not-allowed' : 'pointer', opacity: u.id === profile?.id ? 0.5 : 1 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select>
              {u.id !== profile?.id ? <Toggle on={u.is_active} onToggle={() => toggleActive(u.id, u.is_active)} size="sm" /> : <span style={{ fontSize: 10, color: T.tx3 }}>You</span>}
            </div>
            <ModuleChips u={u} />
          </div>
        ))}
      </div>

      {showInvite && (<div style={S.modalOverlay} onClick={() => { setShowInvite(false); setInviteResult(null); }}><div className="modal-inner" style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Invite New User</span><span onClick={() => { setShowInvite(false); setInviteResult(null); }} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div>
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
            <p style={{ fontSize: 10, color: T.tx3, marginTop: 10, textAlign: 'center' as const }}>The user should change their password after first login</p>
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
      <ConfirmModal {...modalProps} />
    </div>
  );
}
