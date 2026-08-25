// OTP Inbox — OTP SMS from the owner's iPhone, forwarded by an iOS Shortcut
// automation the moment they arrive (iOS lets no app read SMS; the Shortcut
// is the sanctioned bridge). Staff open this and tap a code to copy it.
// Codes older than 10 minutes grey out — an OTP that old is dead anyway;
// everything purges after 24 hours server-side.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';

interface OtpRow { id: string; message: string; code: string | null; device: string | null; received_at: string }

const FRESH_MS = 10 * 60 * 1000;

export default function OtpInbox({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [rows, setRows] = useState<OtpRow[] | null>(null);
  const [now, setNow] = useState(Date.now());

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

      {rows === null && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>}
      {rows !== null && rows.length === 0 && (
        <div style={{ padding: 36, textAlign: 'center', color: T.tx3, fontSize: 12, lineHeight: 1.8 }}>
          No OTPs right now.<br />
          <span style={{ fontSize: 11 }}>Setup: the owner&rsquo;s iPhone needs the one-time Shortcut automation — ask the admin for the setup steps.</span>
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
