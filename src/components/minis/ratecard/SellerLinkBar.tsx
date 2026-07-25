// Owner-only strip inside RateCard Studio (From Master): the single shared
// link sellers use to build their own cards. One click — the link and its
// short URL create themselves on first view, so Copy is the only action.
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/friendlyError';
import { T, S } from '../../../lib/theme';

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const longFor = (token: string) => `${window.location.origin}/#/rc/${token}`;
const shortFor = (code: string) => `${window.location.origin}/#/s/${code}`;
const PREFERRED_CODE = 'ratecard';

export default function SellerLinkBar({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [link, setLink] = useState<{ token: string; short: string | null } | null>(null);
  const started = useRef(false); // StrictMode double-mount must not insert twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const read = () => supabase.from('ratecard_share').select('id, token, short_code').eq('is_active', true).maybeSingle();
      let { data } = await read();
      if (!data) {
        // No link yet: mint one. A partial unique index allows a single active
        // row, so if another admin raced us we just re-read theirs.
        const uid = (await supabase.auth.getUser()).data.user?.id;
        const { error } = await supabase.from('ratecard_share').insert({ token: newToken(), created_by: uid });
        ({ data } = await read());
        if (!data) { addToast(friendlyError(error || 'Could not create the seller link'), 'error'); return; }
      }
      setLink({ token: data.token, short: data.short_code });
      if (data.short_code) return;

      // Give it a friendly Trackly code so the owner shares /#/s/ratecard
      // rather than the 32-hex token. Best effort: if the code is taken, try a
      // suffixed one; if that fails too, the long link still works.
      const uid = (await supabase.auth.getUser()).data.user?.id;
      for (const code of [PREFERRED_CODE, `${PREFERRED_CODE}-${Math.random().toString(36).slice(2, 5)}`]) {
        const { error } = await supabase.from('short_links')
          .insert({ short_code: code, long_url: longFor(data.token), title: 'Seller rate card', created_by: uid });
        if (error) continue;
        await supabase.from('ratecard_share').update({ short_code: code }).eq('id', data.id);
        setLink({ token: data.token, short: code });
        return;
      }
    })();
  }, [addToast]);

  if (!link) return null;
  const url = link.short ? shortFor(link.short) : longFor(link.token);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); addToast('Link copied — send it to your sellers', 'success'); }
    catch { addToast('Could not copy — long-press the link to copy it', 'error'); }
  };

  return (
    <div style={{ background: 'oklch(0.55 0.22 265 / .05)', border: '1px solid oklch(0.55 0.22 265 / .25)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.ac2, marginBottom: 4 }}>Seller link</div>
      <div style={{ fontSize: 10, color: T.tx3, marginBottom: 6, lineHeight: 1.5 }}>
        Sellers open this without logging in and build their own cards — same catalogs and SKU lookup, their own markup.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tx2, wordBreak: 'break-all', flex: 1, minWidth: 180 }}>{url.replace(/^https?:\/\//, '')}</span>
        <button onClick={copy} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 36 }}>Copy link</button>
      </div>
    </div>
  );
}
