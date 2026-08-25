// The one-time iPhone Shortcut setup guide for OTP Inbox, with the tap-to-
// copy URL and shared key. The key is fetched live from the edge function
// (any signed-in user — owner's call); it is never baked into the bundle.
import { useState } from 'react';
import { supabase, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { T, S } from '../../lib/theme';

const FN_URL = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/otp-inbox';

export default function OtpSetupGuide({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [setupKey, setSetupKey] = useState('');

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

  return (
    <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: T.tx2, lineHeight: 1.9 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>iPhone Shortcut — about 3 minutes, on the phone receiving OTPs</div>
      1. Open the <b style={{ color: T.tx }}>Shortcuts</b> app → <b style={{ color: T.tx }}>Automation</b> tab → <b style={{ color: T.tx }}>+</b> New Automation.<br />
      2. Choose <b style={{ color: T.tx }}>Message</b> → &ldquo;Message Contains&rdquo;: type <b style={{ color: T.tx }}>OTP</b> → select <b style={{ color: T.tx }}>Run Immediately</b> → Next.<br />
      3. Add the action <b style={{ color: T.tx }}>&ldquo;Get Contents of URL&rdquo;</b>:<br />
      <span style={{ paddingLeft: 14, display: 'inline-block' }}>• URL: <span onClick={() => copyText('URL', FN_URL)} style={{ fontFamily: T.mono, fontSize: 10, color: T.ac2, cursor: 'pointer', wordBreak: 'break-all' }}>{FN_URL}</span> (tap to copy)</span><br />
      <span style={{ paddingLeft: 14, display: 'inline-block' }}>• Expand it → Method: <b style={{ color: T.tx }}>POST</b> → Request Body: <b style={{ color: T.tx }}>JSON</b>, then add 3 fields:</span><br />
      <span style={{ paddingLeft: 28, display: 'inline-block' }}>– <span style={{ fontFamily: T.mono }}>secret</span> (Text): {setupKey
        ? <span onClick={() => copyText('Key', setupKey)} style={{ fontFamily: T.mono, fontSize: 10, color: T.ac2, cursor: 'pointer', wordBreak: 'break-all' }}>{setupKey} (tap to copy)</span>
        : <button onClick={loadKey} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 26, marginLeft: 4 }}>Show key</button>}</span><br />
      <span style={{ paddingLeft: 28, display: 'inline-block' }}>– <span style={{ fontFamily: T.mono }}>text</span> (Text): tap the field and pick the blue <b style={{ color: T.tx }}>Shortcut Input</b> variable</span><br />
      <span style={{ paddingLeft: 28, display: 'inline-block' }}>– <span style={{ fontFamily: T.mono }}>device</span> (Text): a name like &ldquo;Owner iPhone&rdquo;</span><br />
      4. Done. Send yourself a test SMS containing &ldquo;OTP 123456&rdquo; from another phone — it should appear above within seconds.<br />
      <span style={{ fontSize: 10.5, color: T.tx3 }}>Only messages containing &ldquo;OTP&rdquo; are forwarded — other SMS never leave the phone. If some services say &ldquo;code&rdquo; instead, add a second identical automation with &ldquo;code&rdquo; as the filter.</span>
    </div>
  );
}
