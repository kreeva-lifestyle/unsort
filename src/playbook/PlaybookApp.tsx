// Playbook division (owner, 2026-11-04): its own shell and pages, coded
// separately from DailyWork — rules in src/playbook/CLAUDE.md. Today it is the
// frame only: header with the Playbook logo, a switch back to DailyWork, sign
// out, and the dashboard placeholder the owner will fill in later.
import React, { useEffect, useState } from 'react';
import { T, S } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { setDivision } from '../lib/division';
import { DivisionLogo, DailyWorkMark } from '../components/brand/DivisionLogos';
import PlaybookDashboard from './PlaybookDashboard';

export default function PlaybookApp() {
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  // DailyWork's header owns the title there; give it back when switching.
  useEffect(() => { const prev = document.title; document.title = 'Dashboard · Playbook · DailyOffice'; return () => { document.title = prev; }; }, []);
  // Same as DailyWork's Logout: lock when Face ID is enrolled, else sign out;
  // the reload clears every in-memory state.
  const out = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // A Cash Challan draft (customer, phone, items) must not outlive the session on a shared device.
    try { localStorage.removeItem('ccDraft'); } catch { /* storage blocked: nothing kept to clear */ }
    try { await signOut(); } catch { /* reload below shows the login either way */ }
    window.location.reload();
  };
  return (
    // #root is a fixed overflow:hidden frame, so Playbook brings its own scroller (the header sticks inside it).
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: T.bg, color: T.tx, fontFamily: T.sans } as React.CSSProperties}>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: 10, padding: 'max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))', background: 'rgba(8,11,20,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: `1px solid ${T.bd}` }}>
        <DivisionLogo division="playbook" size={34} />
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setDivision('dailywork')} aria-label="Switch to DailyWork"
          style={{ ...S.btnGhost, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '6px 12px 6px 8px' }}>
          <DailyWorkMark size={24} decorative />DailyWork
        </button>
        <button type="button" onClick={out} aria-label="Log out"
          style={{ ...S.btnGhost, minHeight: 44, pointerEvents: signingOut ? 'none' : 'auto', opacity: signingOut ? 0.5 : 1 }}>{signingOut ? 'Signing out…' : 'Logout'}</button>
      </header>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '20px max(16px, env(safe-area-inset-right)) max(40px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))' }}>
        <PlaybookDashboard name={profile?.full_name?.split(' ')[0] || ''} />
      </main>
    </div>
  );
}
