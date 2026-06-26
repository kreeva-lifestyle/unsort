import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { T, S } from '../lib/theme';

export default function PasswordReset() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) { setError(upErr.message || 'Failed to update password'); setSaving(false); return; }
    setDone(true);
  };

  const goToLogin = () => {
    supabase.auth.signOut();
    window.location.hash = '';
    window.location.reload();
  };

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.rXl, padding: '32px 28px', maxWidth: 380, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>DailyOffice</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>{done ? 'Password Updated' : 'Set New Password'}</div>
        </div>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.gr, fontWeight: 600 }}>Password updated successfully!</div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>You can now sign in with your new password.</div>
            </div>
            <button onClick={goToLogin} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center' }}>Go to Login</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={S.fLabel}>New Password</label>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="Minimum 8 characters" autoFocus style={S.fInput} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.fLabel}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} placeholder="Re-enter password" style={S.fInput} />
            </div>
            {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 12 }}>{error}</div>}
            <button type="submit" disabled={saving} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
