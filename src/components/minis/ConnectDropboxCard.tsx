// One-time admin card to connect the business Dropbox account (OAuth code
// paste flow). Extracted from LinkCheck.tsx; the app key is a public OAuth
// client id served by dropbox_status — the secret stays in the server vault.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

// files.content.read → Link Generator thumbnail proxy (get_thumbnail_v2).
// files.content.write → Forward→Dropbox document uploads (files/upload).
// Tokens minted before a scope was added can't use that feature until the
// admin reconnects once.
const authUrl = (appKey: string) => `https://www.dropbox.com/oauth2/authorize?client_id=${appKey}&response_type=code&token_access_type=offline&scope=${encodeURIComponent('account_info.read files.metadata.read files.content.read files.content.write sharing.read sharing.write')}`;

export default function ConnectDropboxCard({ appKey, call, addToast, onConnected }: {
  appKey: string;
  call: (body: object) => Promise<{ status: number; data: any }>;
  addToast: (m: string, t?: string) => void;
  onConnected: () => void;
}) {
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    if (connecting || !code.trim()) return;
    setConnecting(true);
    try {
      const { data } = await call({ action: 'dropbox_exchange', code: code.trim() });
      if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Connect failed'), 'error'); return; }
      setCode('');
      addToast('Dropbox connected', 'success');
      onConnected();
    } catch (e) {
      // A network throw (flaky mobile right after the Dropbox tab) must not
      // leave the button locked on "Connecting…" forever.
      addToast(friendlyError(e), 'error');
    } finally { setConnecting(false); }
  };

  return (
    <div style={{ background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10, padding: 14, marginBottom: 12, maxWidth: 560 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.bl, marginBottom: 8 }}>Connect Dropbox (one-time, admin)</div>
      <ol style={{ margin: '0 0 10px 16px', padding: 0, fontSize: 11.5, color: T.tx2, lineHeight: 1.9 }}>
        <li>{appKey ? <a href={authUrl(appKey)} target="_blank" rel="noreferrer" style={{ color: T.bl, fontWeight: 600 }}>Click here to open Dropbox</a> : <span style={{ color: T.tx3 }}>Loading…</span>} and press <b>Allow</b>.</li>
        <li>Dropbox will show an <b>access code</b> — copy it.</li>
        <li>Paste the code below and press Connect.</li>
      </ol>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Paste the Dropbox code here" style={{ ...S.fInput, flex: 1, fontFamily: T.mono }} onKeyDown={e => { if (e.key === 'Enter') connect(); }} />
        <button onClick={connect} disabled={connecting || !code.trim()} style={{ ...S.btnPrimary, pointerEvents: connecting ? 'none' : 'auto', opacity: connecting || !code.trim() ? 0.5 : 1 }}>{connecting ? 'Connecting…' : 'Connect'}</button>
      </div>
    </div>
  );
}
