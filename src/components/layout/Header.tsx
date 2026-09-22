import { useState, useEffect, useRef } from 'react';
import { T } from '../../lib/theme';
import { useBreadcrumb } from '../../hooks/useBreadcrumb';
import { closeAllLayers, closeTopLayer, layerCount } from '../../hooks/useBackClose';

// A crumb that can be tapped looks like text but is a real button: keyboard
// reachable, a 44px target, no link semantics (nothing here is a URL of its
// own — the hash names the page, layers live in history state).
const crumbBtn: React.CSSProperties = { background: 'none', border: 0, padding: '0 2px', margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44 };

export default function Header({ title, onNotifClick, notifications, markAsRead, sidebarOpen, onToggleSidebar }: {
  title: string;
  onNotifClick?: (n: any) => void;
  notifications: any[];
  markAsRead: (id: string) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}) {
  const [show, setShow] = useState(false);
  const { crumbs } = useBreadcrumb();
  const unread = notifications.filter((n: any) => !n.is_read).length;

  // The browser tab, history menu and share sheet name the VIEW, innermost
  // first: "FD-1 · Product Costing · Minis · DailyOffice".
  useEffect(() => { document.title = [...crumbs].reverse().concat(title, 'DailyOffice').join(' · '); }, [title, crumbs]);

  const handleNotifClick = (n: any) => {
    markAsRead(n.id);
    setShow(false);
    if (onNotifClick) onNotifClick(n);
  };

  // A middle crumb unwinds to ITSELF, not just one level: layers close from
  // the top one at a time (each close is the layer's own, so its history entry
  // goes with it) until the trail is that crumb's length. Layers without a
  // crumb (a modal over a sub-view) are closed on the way. Each step waits
  // for the commit and stops if a close changed nothing, so it cannot spin.
  const crumbsRef = useRef(crumbs); crumbsRef.current = crumbs;
  const unwindTo = (keep: number) => {
    const step = () => {
      if (crumbsRef.current.length <= keep) return;
      const before = layerCount();
      if (!closeTopLayer()) return;
      setTimeout(() => { if (layerCount() < before) step(); }, 40);
    };
    step();
  };

  const last = crumbs.length - 1;
  return (
    <header className="header-bar" style={{ background: T.s, borderBottom: `1px solid ${T.bd}`, padding: '0 16px', position: 'sticky', top: 0, zIndex: 50, height: 56, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {onToggleSidebar && <button className="desktop-only" onClick={onToggleSidebar} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', cursor: 'pointer', color: T.tx3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }} title={sidebarOpen ? 'Collapse menu' : 'Expand menu'} aria-label="Toggle sidebar">
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }}>{sidebarOpen ? <><path d="M3 12h18M3 6h18M3 18h18" /></> : <><path d="M18 6L6 18M6 6l12 12" /></>}</svg>
        </button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.bl, boxShadow: `0 0 8px ${T.bl}`, flexShrink: 0 }} />
          {/* Breadcrumb trail: every level but the current one is a way back —
              the page name closes every open layer (back to the page root),
              a middle crumb closes every layer above it, the last is where
              you are (aria-current). */}
          <nav aria-label="Breadcrumb" style={{ minWidth: 0 }}>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <li>
                <h1 className="header-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: crumbs.length > 0 ? T.tx3 : T.tx, fontFamily: T.sora, letterSpacing: -0.2 }}>
                  {crumbs.length > 0
                    ? <button type="button" onClick={closeAllLayers} title={`Back to ${title}`} style={crumbBtn}>{title}</button>
                    : title}
                </h1>
              </li>
              {crumbs.map((c, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 17, fontWeight: 700, fontFamily: T.sora, letterSpacing: -0.2 }}>
                  <span aria-hidden="true" style={{ color: T.tx3, margin: '0 5px', fontSize: 12 }}>/</span>
                  {i === last
                    ? <span aria-current="page" style={{ color: T.tx }}>{c}</span>
                    : <button type="button" onClick={() => unwindTo(i + 1)} title={`Back to ${c}`} style={{ ...crumbBtn, color: T.tx3 }}>{c}</button>}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ position: 'relative' }}>
        <button onClick={() => setShow(!show)} aria-label="Notifications" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.bd2}`, background: 'transparent', cursor: 'pointer', position: 'relative', color: T.tx, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'oklch(1 0 0 / 0.05)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>
          {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: T.ac, color: 'white', borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, boxShadow: `0 0 8px ${T.ac44}`, animation: 'subtlePulse 2s ease-in-out infinite' }}>{unread}</span>}
        </button>
        {show && (
          <div className="notif-dropdown" style={{ position: 'absolute', right: 0, top: 38, width: 'min(290px, calc(100vw - 32px))', background: 'rgba(12,16,28,0.96)', backdropFilter: 'blur(24px)', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,.55)', border: `1px solid ${T.bd}`, zIndex: 50, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, fontWeight: 600, fontSize: 11, color: T.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Notifications {unread > 0 && <span style={{ fontSize: 9, fontFamily: T.mono, color: T.ac, background: 'oklch(0.55 0.22 265 / .10)', padding: '2px 6px', borderRadius: 4 }}>{unread} new</span>}</div>
            {notifications.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No new notifications</div> : notifications.slice(0, 10).map((n: any) => (
              <div key={n.id} onClick={() => handleNotifClick(n)} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: n.is_read ? 'transparent' : 'oklch(0.55 0.22 265 / .04)', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'oklch(0.55 0.22 265 / .04)'}>
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
