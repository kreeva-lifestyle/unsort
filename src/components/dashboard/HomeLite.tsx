// Home for a user whose "Dashboard data" is switched off (owner: chips for
// everyone, the dashboard numbers only for those allowed): the greeting and
// the quick-access strip, nothing fetched from the business data.
import { T } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import QuickChips from './QuickChips';

export default function HomeLite({ navigateTo }: { navigateTo?: (tab: string) => void }) {
  const { profile } = useAuth();
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{greeting}, {profile?.full_name?.split(' ')[0] || 'there'}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: T.tx2, fontWeight: 500 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>
      <QuickChips navigateTo={navigateTo} />
      <div style={{ padding: '24px 0', textAlign: 'center', color: T.tx3, fontSize: 11 }}>Your shortcuts live here. Pick the modules and tools you use most with + Add.</div>
    </div>
  );
}
