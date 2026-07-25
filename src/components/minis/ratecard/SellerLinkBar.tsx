// Owner-only strip inside RateCard Studio (From Master): the single shared
// link sellers use to build their own cards. One click — the link creates
// itself on first view, so the only action here is Copy.
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/friendlyError';
import { T, S } from '../../../lib/theme';

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const linkFor = (token: string) => `${window.location.origin}/#/rc/${token}`;

export default function SellerLinkBar({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [token, setToken] = useState('');
  const started = useRef(false); // StrictMode double-mount must not insert twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data } = await supabase.from('ratecard_share').select('token').eq('is_active', true).maybeSingle();
      if (data?.token) { setToken(data.token); return; }
      // No link yet: mint one silently. A partial unique index allows a single
      // active row, so if another admin raced us we just re-read theirs.
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from('ratecard_share').insert({ token: newToken(), created_by: uid });
      const { data: after } = await supabase.from('ratecard_share').select('token').eq('is_active', true).maybeSingle();
      if (after?.token) setToken(after.token);
      else if (error) addToast(friendlyError(error), 'error');
    })();
  }, [addToast]);

  if (!token) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(linkFor(token)); addToast('Link copied — send it to your sellers', 'success'); }
    catch { addToast('Could not copy — long-press the link to copy it', 'error'); }
  };

  return (
    <div style={{ background: 'oklch(0.55 0.22 265 / .05)', border: '1px solid oklch(0.55 0.22 265 / .25)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.ac2, marginBottom: 4 }}>Seller link</div>
      <div style={{ fontSize: 10, color: T.tx3, marginBottom: 6, lineHeight: 1.5 }}>
        Sellers open this without logging in and build their own cards — same SKU lookup, their own markup.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx2, wordBreak: 'break-all', flex: 1, minWidth: 180 }}>{linkFor(token)}</span>
        <button onClick={copy} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 36 }}>Copy link</button>
      </div>
    </div>
  );
}
