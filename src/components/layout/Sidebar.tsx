// App sidebar — navigation + user card + sign-out
import { supabase } from '../../lib/supabase';
import { T, Icon } from '../../lib/theme';

export default function Sidebar({ activeTab, setActiveTab, profile }: { activeTab: string; setActiveTab: (t: string) => void; profile: any }) {
  const isAdmin = profile?.role === 'admin';
  const tabs = [
    { id: 'dashboard', icon: 'grid', label: 'Dashboard' },
    { id: 'inventory', icon: 'box', label: 'Inventory' },
    { id: 'brandtag', icon: 'tag', label: 'Brand Tags' },
    { id: 'packtime', icon: 'scan', label: 'PackStation' },
    { id: 'challan', icon: 'file', label: 'Cash Challan' },
    ...(isAdmin ? [{ id: 'settings', icon: 'settings', label: 'Settings' }] : []),
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="sidebar" style={{ width: 220, height: '100vh', background: 'rgba(8,11,20,0.85)', backdropFilter: 'blur(36px)', WebkitBackdropFilter: 'blur(36px)', borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100, overflowY: 'auto' }}>
      {/* Sidebar ambient glow */}
      <div style={{ position: 'absolute', top: -30, left: -20, width: 160, height: 160, background: `radial-gradient(circle, ${T.ac}10 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ padding: '14px 14px 11px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.sora, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'subtlePulse 4s ease-in-out infinite' }}>DailyOffice</div>
        <div style={{ fontSize: 8, color: T.tx3, letterSpacing: 2.5, textTransform: 'uppercase' as const, marginTop: 2 }}>Your Workspace, Simplified</div>
      </div>
      <div style={{ fontSize: 8, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' as const, padding: '12px 14px 5px', fontWeight: 600 }}>Menu</div>
      <nav style={{ flex: 1, padding: '2px 8px 8px' }}>
        {tabs.map((t) => (
          <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', margin: '2px 0', cursor: 'pointer', background: activeTab === t.id ? 'rgba(99,102,241,.08)' : 'transparent', color: activeTab === t.id ? T.ac2 : T.tx3, fontSize: 11, fontWeight: activeTab === t.id ? 600 : 400, fontFamily: T.sans, borderRadius: 6, transition: 'all .18s ease', position: 'relative' }}
            onMouseEnter={e => { if (activeTab !== t.id) { e.currentTarget.style.background = 'rgba(99,102,241,.04)'; e.currentTarget.style.color = T.tx2; } }}
            onMouseLeave={e => { if (activeTab !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.tx3; } }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: activeTab === t.id ? 'rgba(99,102,241,.12)' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s ease' }}><Icon name={t.icon} size={14} /></span>
            {t.label}
            {activeTab === t.id && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, borderRadius: '0 3px 3px 0', background: T.ac, boxShadow: `0 0 8px ${T.ac}88`, animation: 'pulseGlow 2s ease-in-out infinite' }} />}
          </div>
        ))}
      </nav>
      <div style={{ padding: '10px 10px', borderTop: `1px solid ${T.bd}`, marginTop: 'auto' }}>
        {profile && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 9px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${T.bd}`, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'} onMouseLeave={e => e.currentTarget.style.borderColor = T.bd}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(profile.full_name || 'U')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name}</p><p style={{ margin: 0, fontSize: 8, color: T.tx3, textTransform: 'capitalize' as const }}>{profile.role}</p></div>
        </div>}
        <div onClick={handleSignOut} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.04)', border: '1px solid rgba(248,113,113,.10)', color: '#f87171', cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,.08)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,.20)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,.04)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,.10)'; }}>Sign Out</div>
        <p style={{ margin: '8px 0 0', fontSize: 7, color: T.tx3, letterSpacing: 1.5, textTransform: 'uppercase' as const, textAlign: 'center', opacity: 0.3 }}>Powered by Arya Designs</p>
      </div>
      </div>
    </div>
  );
}
