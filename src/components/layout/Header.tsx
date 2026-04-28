// App header — title, global search, scanner trigger, notification bell
import { useState } from 'react';
import { T, Icon } from '../../lib/theme';

export default function Header({ title, onSearch, onNotifClick, onOpenScanner, notifications, markAsRead }: {
  title: string;
  onSearch?: (q: string) => void;
  onNotifClick?: (n: any) => void;
  onOpenScanner?: () => void;
  notifications: any[];
  markAsRead: (id: string) => void;
}) {
  const [show, setShow] = useState(false);
  const unread = notifications.filter((n: any) => !n.is_read).length;
  const [globalSearch, setGlobalSearch] = useState('');

  const handleNotifClick = (n: any) => {
    markAsRead(n.id);
    setShow(false);
    if (onNotifClick) onNotifClick(n);
  };

  return (
    <header className="header-bar" style={{ background: 'rgba(8,11,20,0.60)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', borderBottom: `1px solid ${T.bd}`, padding: '0 16px', position: 'sticky', top: 0, zIndex: 50, height: 44, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* Title with accent dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, boxShadow: `0 0 8px ${T.ac}55` }} />
          <h1 className="header-title" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.tx, whiteSpace: 'nowrap', fontFamily: T.sora, letterSpacing: -0.2 }}>{title}</h1>
        </div>
        {/* Separator */}
        <div style={{ width: 1, height: 18, background: `linear-gradient(180deg, transparent, ${T.bd2}, transparent)`, flexShrink: 0 }} />
        {/* Search */}
        <div className="header-search" style={{ flex: 1, maxWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '5px 10px', transition: 'all .18s' }}>
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, flexShrink: 0, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
            <input value={globalSearch} onChange={(e) => { setGlobalSearch(e.target.value); onSearch?.(e.target.value); }} placeholder="Search items, IDs, SKUs..." style={{ background: 'transparent', border: 'none', outline: 'none', color: T.tx, fontFamily: T.sans, fontSize: 11, flex: 1, minWidth: 0 }} />
            {globalSearch && <span onClick={() => { setGlobalSearch(''); onSearch?.(''); }} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14, lineHeight: 1, opacity: 0.5, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>×</span>}
          </div>
        </div>
        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => onOpenScanner?.()} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', color: T.tx3, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }} title="Scan barcode" onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = T.bd2; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = T.bd; }}>
          <Icon name="scan" size={14} />
        </button>
        <div style={{ position: 'relative' }}>
        <button onClick={() => setShow(!show)} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', position: 'relative', color: T.tx3, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = T.bd2; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = T.bd; }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>
          {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: T.ac, color: 'white', borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, boxShadow: `0 0 8px ${T.ac}66`, animation: 'subtlePulse 2s ease-in-out infinite' }}>{unread}</span>}
        </button>
        {show && (
          <div className="notif-dropdown" style={{ position: 'absolute', right: 0, top: 38, width: 'min(290px, calc(100vw - 32px))', background: 'rgba(12,16,28,0.96)', backdropFilter: 'blur(24px)', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,.55)', border: `1px solid ${T.bd}`, zIndex: 50, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, fontWeight: 600, fontSize: 11, color: T.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Notifications {unread > 0 && <span style={{ fontSize: 9, fontFamily: T.mono, color: T.ac, background: 'rgba(99,102,241,.10)', padding: '2px 6px', borderRadius: 4 }}>{unread} new</span>}</div>
            {notifications.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>🔔 No new notifications</div> : notifications.slice(0, 10).map((n: any) => (
              <div key={n.id} onClick={() => handleNotifClick(n)} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: n.is_read ? 'transparent' : 'rgba(99,102,241,.04)', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(99,102,241,.04)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: T.tx }}>{n.title}</p>
                  {!n.is_read && <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.ac, flexShrink: 0, marginTop: 4 }} />}
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: T.tx3, lineHeight: 1.4 }}>{n.message}</p>
                <p style={{ margin: '3px 0 0', fontSize: 9, color: T.tx3, opacity: 0.5 }}>{new Date(n.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      </div>
    </header>
  );
}
