// Playbook division (owner, 2026-11-04): its own shell and pages, coded
// separately from DailyWork — rules in src/playbook/CLAUDE.md. Today it is the
// frame only: header with the Playbook logo, a switch back to DailyWork, sign
// out, and the dashboard placeholder the owner will fill in later.
import { useEffect, useState } from 'react';
import { T, S } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { setDivision } from '../lib/division';
import { DivisionLogo, DailyWorkMark } from '../components/brand/DivisionLogos';
import PlaybookDashboard from './PlaybookDashboard';

export default function PlaybookApp() {
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { document.title = 'Dashboard · Playbook · DailyOffice'; }, []);
  // Same as DailyWork's Logout: lock when Face ID is enrolled, else sign out;
  // the reload clears every in-memory state.
  const out = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } catch { /* reload below shows the login either way */ }
    window.location.reload();
  };
  return (
    <div style={{ minHeight: '100dvh', background: T.bg, color: T.tx, fontFamily: T.sans }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: 10, padding: 'max(12px, env(safe-area-inset-top)) 16px 12px', background: 'rgba(8,11,20,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: `1px solid ${T.bd}` }}>
        <DivisionLogo division="playbook" size={34} />
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setDivision('dailywork')} aria-label="Switch to DailyWork"
          style={{ ...S.btnGhost, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '6px 12px 6px 6px' }}>
          <DailyWorkMark size={26} /><span className="desktop-only">DailyWork</span>
        </button>
        <button type="button" onClick={out} aria-label="Log out"
          style={{ ...S.btnGhost, minHeight: 40, pointerEvents: signingOut ? 'none' : 'auto', opacity: signingOut ? 0.5 : 1 }}>{signingOut ? 'Signing out…' : 'Logout'}</button>
      </header>
      <main className="page-pad" style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 16px 40px' }}>
        <PlaybookDashboard name={profile?.full_name?.split(' ')[0] || ''} />
      </main>
    </div>
  );
}
