// Owner-only strip inside RateCard Studio (From Master): the single shared
// link sellers use to build their own cards. The token IS the credential, so
// Rotate exists — it deactivates the current row and mints a new one, which
// kills every copy of the old URL at once.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/friendlyError';
import { T, S } from '../../../lib/theme';

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const linkFor = (token: string) => `${window.location.origin}/#/rc/${token}`;

export default function SellerLinkBar({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [row, setRow] = useState<{ token: string; use_count: number; last_used_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('ratecard_share')
      .select('token, use_count, last_used_at').eq('is_active', true).maybeSingle();
    if (error) addToast(friendlyError(error), 'error');
    setRow(data ?? null);
    setLoading(false);
  }, [addToast]);
  useEffect(() => { load(); }, [load]);

  // Rotate = deactivate every live row, then insert a fresh token. Order
  // matters: the partial unique index allows only one active row.
  const mint = async (rotating: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (rotating) {
        const { error } = await supabase.from('ratecard_share').update({ is_active: false }).eq('is_active', true);
        if (error) throw error;
      }
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from('ratecard_share').insert({ token: newToken(), created_by: uid });
      if (error) throw error;
      await load();
      addToast(rotating ? 'New link created — the old one stopped working' : 'Seller link created', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setConfirmRotate(false);
    setBusy(false);
  };

  const copy = async () => {
    if (!row) return;
    try { await navigator.clipboard.writeText(linkFor(row.token)); addToast('Link copied — send it to your sellers', 'success'); }
    catch { addToast('Could not copy — long-press the link to copy it', 'error'); }
  };

  if (loading) return null;

  return (
    <div style={{ background: 'oklch(0.55 0.22 265 / .05)', border: '1px solid oklch(0.55 0.22 265 / .25)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.ac2, marginBottom: 6 }}>Seller link</div>
      {!row ? (
        <>
          <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginBottom: 8 }}>
            Create a link your sellers can open without logging in. They get this same From-Master flow — type SKUs, pick columns, add their own markup.
          </div>
          <button onClick={() => mint(false)} disabled={busy} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 36, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
            {busy ? 'Creating…' : 'Create seller link'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.tx2, wordBreak: 'break-all', marginBottom: 6 }}>{linkFor(row.token)}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}>
            Opened {row.use_count} time{row.use_count === 1 ? '' : 's'}{row.last_used_at ? ` · last ${new Date(row.last_used_at).toLocaleDateString('en-IN')}` : ''} · anyone with this link can look up any SKU
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={copy} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 36 }}>Copy link</button>
            {!confirmRotate
              ? <button onClick={() => setConfirmRotate(true)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>Rotate</button>
              : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: T.tx2 }}>Old link stops working immediately.</span>
                  <button onClick={() => mint(true)} disabled={busy} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 36, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy ? 'Rotating…' : 'Rotate now'}</button>
                  <button onClick={() => setConfirmRotate(false)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>Keep</button>
                </span>}
          </div>
        </>
      )}
    </div>
  );
}
