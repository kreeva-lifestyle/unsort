// The two-option entry on the sign-in card: Face ID (when it can work on
// this device) or email. Moved out of Login.tsx.
import { T } from '../../lib/theme';

export default function FaceIdChoice({ busy, onFaceId, onEmail }: { busy: boolean; onFaceId: () => void; onEmail: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" onClick={onFaceId} disabled={busy} style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', cursor: busy ? 'default' : 'pointer', fontSize: 15, fontWeight: 600, fontFamily: T.sora, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, boxShadow: `0 8px 24px ${T.ac44}`, transition: 'all .2s', filter: busy ? 'brightness(0.7)' : 'none', letterSpacing: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20, fill: 'none', stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M3 8V6a3 3 0 013-3h2M16 3h2a3 3 0 013 3v2M21 16v2a3 3 0 01-3 3h-2M8 21H6a3 3 0 01-3-3v-2" />
          <path d="M9 9.5v1M15 9.5v1M12 9.5v3.2a.8.8 0 01-.8.8" />
          <path d="M9 15.2a4.2 4.2 0 006 0" />
        </svg>
        {busy ? 'Waiting for Face ID…' : 'Login with Face ID'}
      </button>
      <button type="button" onClick={onEmail} style={{ width: '100%', padding: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: T.sora, color: T.tx2, background: 'rgba(255,255,255,.04)', transition: 'all .2s', letterSpacing: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
        </svg>
        Login via Email
      </button>
    </div>
  );
}
