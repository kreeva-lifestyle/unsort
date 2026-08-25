// OTP Inbox — OTP SMS from the owner's iPhone, forwarded by an iOS Shortcut
// automation the moment they arrive (iOS lets no app read SMS; the Shortcut
// is the sanctioned bridge). Staff open this and tap a code to copy it.
// Codes older than 10 minutes grey out — an OTP that old is dead anyway;
// everything purges after 24 hours server-side.
import { useState, useEffect, useCallback } from 'react';
import { supabase, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';

interface OtpRow { id: string; message: string; code: string | null; device: string | null; received_at: string }

const FRESH_MS = 10 * 60 * 1000;

const FN_URL = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/otp-inbox';

export default function OtpInbox({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<OtpRow[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [guideOpen, setGuideOpen] = useState(false);
  const [setupKey, setSetupKey] = useState('');

  // The shared key the Shortcut needs - fetched live, ADMIN-only, enforced
  // server-side. It is never baked into the app bundle.
  const loadKey = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'setup' }),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.ok) setSetupKey(String(d.secret));
      else addToast(String(d?.error || 'Could not load the setup key'), 'error');
    } catch { addToast('Could not load the setup key — check the connection', 'error'); }
  };

  const copyText = async (label: string, v: string) => {
    try { await navigator.clipboard.writeText(v); addToast(`${label} copied`, 'success'); }
    catch { addToast('Could not copy', 'error'); }
  };

  const load = useCallback(() => {
    supabase.from('otp_inbox').select('id, message, code, device, received_at')
      .order('received_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) { addToast(friendlyError(error), 'error'); setRows([]); return; }
        setRows((data ?? []) as OtpRow[]);
      });
  }, [addToast]);

  useEffect(() => {
    load();
    // New OTPs appear the moment the phone forwards them.
    const ch = supabase.channel('otp-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'otp_inbox' }, payload => {
        setRows(prev => [payload.new as OtpRow, ...(prev ?? [])]);
      })
      .subscribe();
    // Re-render every 30s so the age labels and fresh/expired styling track.
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); addToast(`${code} copied`, 'success'); }
    catch { addToast('Could not copy — long-press the code instead', 'error'); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('otp_inbox').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows(prev => (prev ?? []).filter(r => r.id !== id));
  };

  const age = (iso: string): string => {
    const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
        OTPs from the owner&rsquo;s phone appear here the moment they arrive — tap a code to copy it. Codes fade after 10 minutes and clear out after a day.
      </div>

      <button onClick={() => setGuideOpen(o => !o)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, marginBottom: 10 }}>
        {guideOpen ? 'Hide setup guide' : 'How to set up (one-time, on the phone receiving OTPs)'}
      </button>
      {guideOpen && (
        <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: T.tx2, lineHeight: 1.9 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>iPhone Shortcut — about 3 minutes</div>
          1. Open the <b style={{ color: T.tx }}>Shortcuts</b> app → <b style={{ color: T.tx }}>Automation</b> tab → <b style={{ color: T.tx }}>+</b> New Automation.<br />
          2. Choose <b style={{ color: T.tx }}>Message</b> → &ldquo;Message Contains&rdquo;: type <b style={{ color: T.tx }}>OTP</b> → select <b style={{ color: T.tx }}>Run Immediately</b> → Next.<br />
          3. Add the action <b style={{ color: T.tx }}>&ldquo;Get Contents of URL&rdquo;</b>:<br />
          <span style={{ paddingLeft: 14, display: 'inline-block' }}>• URL: <span onClick={() => copyText('URL', FN_URL)} style={{ fontFamily: T.mono, fontSize: 10, color: T.ac2, cursor: 'pointer', wordBreak: 'break-all' }}>{FN_URL}</span> (tap to copy)</span><br />
          <span style={{ paddingLeft: 14, display: 'inline-block' }}>• Expand it → Method: <b style={{ color: T.tx }}>POST</b> → Request Body: <b style={{ color: T.tx }}>JSON</b>, then add 3 fields:</span><br />
          <span style={{ paddingLeft: 28, display: 'inline-block' }}>– <span style={{ fontFamily: T.mono }}>secret</span> (Text): {setupKey
            ? <span onClick={() => copyText('Key', setupKey)} style={{ fontFamily: T.mono, fontSize: 10, color: T.ac2, cursor: 'pointer', wordBreak: 'break-all' }}>{setupKey} (tap to copy)</span>
            : profile?.role === 'admin'
              ? <button onClick={loadKey} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 26, marginLeft: 4 }}>Show key</button>
              : <span style={{ color: T.yl }}>ask the admin for the key</span>}</span><br />
          <span style={{ paddingLeft: 28, display: 'inline-block' }}>– <span style={{ fontFamily: T.mono }}>text</span> (Text): tap the field and pick the blue <b style={{ color: T.tx }}>Shortcut Input</b> variable</span><br />
          <span style={{ paddingLeft: 28, display: 'inline-block' }}>– <span style={{ fontFamily: T.mono }}>device</span> (Text): a name like &ldquo;Owner iPhone&rdquo;</span><br />
          4. Done. Send yourself a test SMS containing &ldquo;OTP 123456&rdquo; from another phone — it should appear above within seconds.<br />
          <span style={{ fontSize: 10.5, color: T.tx3 }}>Only messages containing &ldquo;OTP&rdquo; are forwarded — other SMS never leave the phone. If some services say &ldquo;code&rdquo; instead, add a second identical automation with &ldquo;code&rdquo; as the filter.</span>
        </div>
      )}

      {rows === null && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>}
      {rows !== null && rows.length === 0 && (
        <div style={{ padding: 36, textAlign: 'center', color: T.tx3, fontSize: 12, lineHeight: 1.8 }}>
          No OTPs right now.<br />
          <span style={{ fontSize: 11 }}>First time? Open the setup guide above — one Shortcut on the owner&rsquo;s iPhone and codes start appearing here.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(rows ?? []).map(r => {
          const fresh = now - new Date(r.received_at).getTime() < FRESH_MS;
          return (
            <div key={r.id} style={{ border: `1px solid ${fresh ? 'oklch(0.72 0.19 145 / .3)' : T.bd}`, background: fresh ? 'oklch(0.72 0.19 145 / .04)' : 'rgba(255,255,255,0.015)', borderRadius: 10, padding: '10px 12px', opacity: fresh ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {r.code ? (
                  <button onClick={() => copy(r.code!)} title="Tap to copy"
                    style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 800, letterSpacing: 2, color: fresh ? T.gr : T.tx3, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', minHeight: 44 }}>
                    {r.code}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: T.yl }}>No code detected — read the message</span>
                )}
                <span style={{ fontSize: 10, color: T.tx3, marginLeft: 'auto' }}>{fresh ? '' : 'expired · '}{age(r.received_at)}{r.device ? ` · ${r.device}` : ''}</span>
                <span onClick={() => remove(r.id)} aria-label="Delete OTP" style={{ cursor: 'pointer', color: T.tx3, fontSize: 15, padding: 4 }}>&#215;</span>
              </div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginTop: 4, wordBreak: 'break-word' }}>{r.message}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
