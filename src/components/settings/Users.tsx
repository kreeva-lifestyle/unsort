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
import Empty from '../ui/Empty';
import { SkeletonRows } from '../ui/Skeleton';

export default function Users({ addToast, profile }: { addToast: (msg: string, type?: string) => void; profile: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', password: '', role: 'viewer' });
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null);
  const { ask, modalProps } = useConfirm();

  useEffect(() => {
    document.body.classList.toggle('modal-open', showInvite);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showInvite]);

  const fetchUsers = () => { supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at, module_access').order('created_at', { ascending: false }).then(({ data, error }) => { if (error) addToast('Failed to load users — ' + friendlyError(error), 'error'); setUsers(data || []); setLoading(false); }); };
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
    if (error) addToast('Role change failed — ' + friendlyError(error), 'error'); else { addToast(`Role updated to ${role}`, 'success'); fetchUsers(); }
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
    if (error) { addToast(friendlyError(error), 'error'); return; }
    // Ban/unban the AUTH account too — without this the user's session keeps
    // working and they can password-reset back in. The edge function verifies
    // the caller is an active admin before touching auth.
    const { error: banErr } = await supabase.functions.invoke('admin-users', {
      body: { action: isActive ? 'deactivate' : 'reactivate', target_user_id: id },
    });
    if (banErr) addToast(`Profile updated, but ${isActive ? 'login ban' : 'login unban'} failed — ${friendlyError(banErr)}. Toggle again to retry.`, 'error');
    else addToast(isActive ? 'Access revoked — user is signed out and login is blocked' : 'Access granted', 'success');
    fetchUsers();
  };

  const toggleModule = async (userId: string, modKey: string) => {
    const { data: fresh } = await supabase.from('profiles').select('module_access').eq('id', userId).maybeSingle();
    const access = { ...( fresh?.module_access || Object.fromEntries(ALL_MODULE_KEYS.map(k => [k, true])) ) };
    access[modKey] = !access[modKey];
    const { error } = await supabase.from('profiles').update({ module_access: access }).eq('id', userId);
    if (error) addToast('Failed to update access — ' + friendlyError(error), 'error');
    else fetchUsers();
  };

  const ROLE_COLORS: Record<string, string> = { admin: T.yl, manager: T.ac2, operator: T.bl, viewer: T.tx3 };

  const ModuleAccess = ({ u }: { u: any }) => {
    if (u.role === 'admin') {
      return (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2, flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>
          <span style={{ fontSize: 11, color: T.tx2, fontWeight: 500 }}>Full access to all modules</span>
        </div>
      );
    }
    const access: Record<string, boolean> = u.module_access || Object.fromEntries(ALL_MODULE_KEYS.map(k => [k, true]));
    const onCount = ALL_MODULE_KEYS.filter(k => access[k] !== false).length;
    return (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.bd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.7 }}>Module Access</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: T.tx3, fontFamily: T.mono }}>{onCount}/{ALL_MODULE_KEYS.length}</span>
        </div>
        <div className="user-card-chips" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {ALL_MODULE_KEYS.map(k => {
            const on = access[k] !== false;
            return (
              <button key={k} onClick={() => toggleModule(u.id, k)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', userSelect: 'none', minHeight: 30,
                  background: on ? 'rgba(34,197,94,.10)' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${on ? 'rgba(34,197,94,.28)' : T.bd}`,
                  color: on ? T.gr : T.tx3 }}>
                <span style={{ fontSize: 9, opacity: on ? 1 : 0.55 }}>{on ? '✓' : '✕'}</span>{MODULE_LABELS[k]}
              </button>
            );
          })}
        </div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Team Members</div>
          {users.length > 0 && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{users.length} {users.length === 1 ? 'member' : 'members'} · {users.filter(u => u.is_active).length} active</div>}
        </div>
        <div onClick={() => setShowInvite(true)} style={S.btnPrimary}>+ Invite User</div>
      </div>
      {loading && users.length === 0 && <SkeletonRows rows={4} />}
      {!loading && users.length === 0 && <Empty icon="clipboard" title="No team members" message="Invite your first team member to get started." cta="+ Invite User" onCta={() => setShowInvite(true)} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => {
          const isYou = u.id === profile?.id;
          const ring = ROLE_COLORS[u.role] || T.ac2;
          return (
            <div key={u.id} className="user-card" style={{ background: T.glass2, border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 16, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,.28)')} onMouseLeave={e => (e.currentTarget.style.borderColor = T.bd2)}>
              <div className="user-card-head" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0, boxShadow: `0 0 0 2px ${T.bg}, 0 0 0 3.5px ${ring}66` }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: T.tx, fontFamily: T.sora }}>{u.full_name || 'Unnamed'}</span>
                    {isYou && <span style={{ fontSize: 8, fontWeight: 700, color: T.ac2, background: T.ac3, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>YOU</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
                <div className="user-card-controls" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={isYou} style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${ring}44`, borderRadius: 8, color: T.tx, fontSize: 12, fontWeight: 600, padding: '7px 10px', height: 36, outline: 'none', cursor: isYou ? 'not-allowed' : 'pointer', opacity: isYou ? 0.55 : 1 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', ...(u.is_active ? { background: 'rgba(45,212,160,.10)', color: T.gr } : { background: 'rgba(245,87,92,.10)', color: T.re }) }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />{u.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {!isYou && <Toggle on={u.is_active} onToggle={() => toggleActive(u.id, u.is_active)} size="sm" />}
                </div>
              </div>
              <ModuleAccess u={u} />
            </div>
          );
        })}
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
