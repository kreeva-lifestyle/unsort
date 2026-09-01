// OTP Inbox — OTP SMS from the owner's iPhone, forwarded by an iOS Shortcut
// automation the moment they arrive (iOS lets no app read SMS; the Shortcut
// is the sanctioned bridge). Staff open this and tap a code to copy it.
// Codes stay fully readable for their whole life (owner's call — delivery
// codes are used days later); a green highlight marks the fresh ones.
// Everything purges after 30 days server-side (purge-otp-inbox cron).
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import OtpSetupGuide from './OtpSetupGuide';
import OtpFolderSetting from './OtpFolderSetting';

interface OtpRow {
  id: string; message: string; code: string | null; device: string | null; received_at: string;
  sheet_status: string | null; sheet_file: string | null;
}

// "Fresh" only adds the green just-arrived highlight — nothing fades after.
const FRESH_MS = 10 * 60 * 1000;

export default function OtpInbox({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [rows, setRows] = useState<OtpRow[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    supabase.from('otp_inbox').select('id, message, code, device, received_at, sheet_status, sheet_file', { count: 'exact' })
      .order('received_at', { ascending: false }).range(page * perPage, page * perPage + perPage - 1)
      .then(({ data, error, count: total }) => {
        if (error) { addToast(friendlyError(error), 'error'); setRows([]); return; }
        setRows((data ?? []) as OtpRow[]);
        setCount(total ?? 0);
        // The nightly purge can strand a page past the end — snap back.
        if ((data ?? []).length === 0 && (total ?? 0) > 0 && page > 0) setPage(0);
      });
  }, [addToast, page, perPage]);

  // The realtime/foreground handlers below are mounted ONCE but must always
  // refetch the CURRENT page — the ref keeps them pointed at the latest load.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; load(); }, [load]);

  useEffect(() => {
    // New OTPs appear the moment the phone forwards them: refetch the page
    // (keeps the count and page contents exact, wherever the user is).
    const ch = supabase.channel('otp-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'otp_inbox' }, () => loadRef.current())
      // The delivery-sheet result (saved to Dropbox / any problem) lands on
      // the row seconds after the insert — merge it in live.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'otp_inbox' }, payload => {
        const next = payload.new as OtpRow;
        setRows(prev => (prev ?? []).map(r => (r.id === next.id ? { ...r, ...next } : r)));
      })
      // Reload whenever the channel (re)connects: iOS suspends the socket
      // while the PWA is backgrounded, and anything that arrived meanwhile
      // would otherwise be missed until a manual refresh.
      .subscribe(status => { if (status === 'SUBSCRIBED') loadRef.current(); });
    // Same story when the app returns to the foreground or regains focus —
    // no refresh button needed, the list refetches itself.
    const onVisible = () => { if (document.visibilityState === 'visible') loadRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Re-render every 30s so the age labels and the fresh highlight track.
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      supabase.removeChannel(ch); clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); addToast(`${code} copied`, 'success'); }
    catch { addToast('Could not copy — long-press the code instead', 'error'); }
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
        OTPs from the owner&rsquo;s phone appear here the moment they arrive — tap a code to copy it. Codes stay here for 30 days, then clear automatically.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button onClick={() => setGuideOpen(o => !o)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>
          {guideOpen ? 'Hide Setup Guide' : 'Setup Guide'}
        </button>
        <button onClick={() => setSettingsOpen(o => !o)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>
          {settingsOpen ? 'Hide settings' : 'Settings'}
        </button>
      </div>
      {settingsOpen && <OtpFolderSetting addToast={addToast} />}
      {guideOpen && <OtpSetupGuide addToast={addToast} />}

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
            <div key={r.id} style={{ border: `1px solid ${fresh ? 'oklch(0.72 0.19 145 / .3)' : T.bd}`, background: fresh ? 'oklch(0.72 0.19 145 / .04)' : 'rgba(255,255,255,0.015)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {r.code ? (
                  <button onClick={() => copy(r.code!)} title="Tap to copy"
                    style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 800, letterSpacing: 2, color: fresh ? T.gr : T.tx, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', minHeight: 44 }}>
                    {r.code}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: T.yl }}>No code detected — read the message</span>
                )}
                <span style={{ fontSize: 10, color: T.tx3, marginLeft: 'auto' }}>{age(r.received_at)}{r.device ? ` · ${r.device}` : ''}</span>
              </div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginTop: 4, wordBreak: 'break-word' }}>{r.message}</div>
              {r.sheet_file && (
                <div style={{ fontSize: 10.5, color: T.gr, marginTop: 6 }}>✓ Delivery sheet saved to Dropbox: {r.sheet_file}</div>
              )}
              {!r.sheet_file && r.sheet_status && (
                <div style={{ fontSize: 10.5, color: T.yl, marginTop: 6, lineHeight: 1.5 }}>{r.sheet_status}</div>
              )}
            </div>
          );
        })}
      </div>

      {count > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(count / perPage));
        return (
          <div className="pager" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1 }} aria-label="Previous page">Prev</button>
              <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1 }} aria-label="Next page">Next</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: T.tx3 }}>{count} OTPs</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }}
                style={{ ...S.fInput, width: 'auto', padding: '4px 8px', fontSize: 11, height: 28, cursor: 'pointer' }}>
                <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
