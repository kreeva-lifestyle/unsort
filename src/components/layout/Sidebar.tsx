import { supabase } from '../../lib/supabase';
import { T, Icon } from '../../lib/theme';

export default function Sidebar({ activeTab, setActiveTab, profile }: { activeTab: string; setActiveTab: (t: string) => void; profile: any }) {
  const role = profile?.role;
  const canAccess = (t: string) => {
    if (!role) return t === 'dashboard';
    if (role === 'admin' || role === 'manager') return true;
    if (role === 'operator') return !['brandtag', 'challan', 'programs'].includes(t);
    return ['dashboard', 'inventory', 'settings'].includes(t);
  };
  const tabs = [
    { id: 'dashboard', icon: 'grid', label: 'Home' },
    { id: 'inventory', icon: 'box', label: 'Inventory' },
    { id: 'brandtag', icon: 'tag', label: 'Brand Tags' },
    { id: 'packtime', icon: 'scan', label: 'PackStation' },
    { id: 'challan', icon: 'file', label: 'Cash Challan' },
    { id: 'programs', icon: 'box', label: 'Programs' },
    ...(profile ? [{ id: 'settings', icon: 'settings', label: 'Settings' }] : []),
  ].filter(t => canAccess(t.id));

  const handleSignOut = async () => {
    try { localStorage.removeItem('ccDraft'); } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.reload();
  };

  return (
    <div className="sidebar" style={{ width: 220, height: '100vh', background: 'rgba(8,11,20,0.95)', backdropFilter: 'blur(36px)', WebkitBackdropFilter: 'blur(36px)', borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100, overflowY: 'auto' }}>

      {/* User profile header */}
      <div style={{ padding: '20px 18px 16px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0, boxShadow: `0 4px 14px ${T.ac}33` }}>{(profile?.full_name || 'U')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Hello, {profile?.full_name?.split(' ')[0] || 'there'}</div>
            <div style={{ fontSize: 10, color: T.tx3, textTransform: 'capitalize' as const, marginTop: 1 }}>{profile?.role || ''}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {tabs.map((t) => (
          <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', margin: '1px 0', cursor: 'pointer', background: activeTab === t.id ? T.ac3 : 'transparent', color: activeTab === t.id ? T.ac2 : T.tx3, fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, fontFamily: T.sans, borderRadius: 8, transition: 'all .18s ease', position: 'relative' }}
            onMouseEnter={e => { if (activeTab !== t.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = T.tx2; } }}
            onMouseLeave={e => { if (activeTab !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.tx3; } }}>
            <Icon name={t.icon} size={18} />
            {t.label}
            {activeTab === t.id && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: '0 3px 3px 0', background: T.ac, boxShadow: `0 0 8px ${T.ac}88` }} />}
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '12px 10px 16px', borderTop: `1px solid ${T.bd}`, marginTop: 'auto' }}>
        <div onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 8, cursor: 'pointer', color: T.tx3, fontSize: 13, fontWeight: 400, transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = T.tx2; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.tx3; }}>
          <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Logout
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 8, color: T.tx3, letterSpacing: 1.5, textTransform: 'uppercase' as const, textAlign: 'center', opacity: 0.3 }}>DailyOffice</p>
      </div>
    </div>
  );
}
