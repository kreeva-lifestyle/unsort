// OTP Inbox — OTP SMS from the owner's iPhone, forwarded by an iOS Shortcut
// automation the moment they arrive (iOS lets no app read SMS; the Shortcut
// is the sanctioned bridge). Staff open this and tap a code to copy it.
// Codes stay fully readable for their whole life (owner's call — delivery
// codes are used days later); a green highlight marks the fresh ones.
// Everything purges after 30 days server-side (purge-otp-inbox cron).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import OtpSetupGuide from './OtpSetupGuide';

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
  const [folder, setFolder] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);

  // Where courier delivery-sheet PDFs get filed — a GLOBAL app setting.
  const openSettings = async () => {
    setSettingsOpen(o => !o);
    if (settingsOpen) return;
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'otp_delivery_sheet_folder').maybeSingle();
    if (typeof data?.value === 'string') setFolder(data.value);
  };
  const saveFolder = async () => {
    if (savingFolder) return;
    const v = folder.trim().replace(/\/+$/, '');
    const path = v ? (v.startsWith('/') ? v : `/${v}`) : '';
    if (!path) { addToast('Type the Dropbox folder first — e.g. /Delivery Sheets', 'error'); return; }
    setSavingFolder(true);
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'otp_delivery_sheet_folder', value: path, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSavingFolder(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setFolder(path);
    addToast(`Delivery sheets will save to ${path}`, 'success');
  };

  const load = useCallback(() => {
    supabase.from('otp_inbox').select('id, message, code, device, received_at, sheet_status, sheet_file')
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
        const next = payload.new as OtpRow;
        // A foreground reload can race the realtime event — never show a row twice.
        setRows(prev => ((prev ?? []).some(r => r.id === next.id) ? prev : [next, ...(prev ?? [])]));
      })
      // The delivery-sheet result (saved to Dropbox / any problem) lands on
      // the row seconds after the insert — merge it in live.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'otp_inbox' }, payload => {
        const next = payload.new as OtpRow;
        setRows(prev => (prev ?? []).map(r => (r.id === next.id ? { ...r, ...next } : r)));
      })
      // Reload whenever the channel (re)connects: iOS suspends the socket
      // while the PWA is backgrounded, and anything that arrived meanwhile
      // would otherwise be missed until a manual refresh.
      .subscribe(status => { if (status === 'SUBSCRIBED') load(); });
    // Same story when the app returns to the foreground or regains focus —
    // no refresh button needed, the list refetches itself.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Re-render every 30s so the age labels and the fresh highlight track.
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      supabase.removeChannel(ch); clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

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
        <button onClick={openSettings} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>
          {settingsOpen ? 'Hide settings' : 'Settings'}
        </button>
      </div>
      {settingsOpen && (
        <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <label style={S.fLabel}>Dropbox folder for courier delivery sheets</label>
          <div style={{ fontSize: 10.5, color: T.tx3, lineHeight: 1.6, margin: '2px 0 8px' }}>
            When a courier SMS (Shadowfax etc.) carries a delivery-sheet link, the sheet is saved here automatically as a PDF named by date and courier — e.g. 26-08-2026 - Shadow Fax.pdf. Couriers are recognised from the names saved in PackStation settings.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="/Delivery Sheets"
              onKeyDown={e => { if (e.key === 'Enter') saveFolder(); }}
              style={{ ...S.fInput, flex: 1, minWidth: 180, fontFamily: T.mono }} />
            <button onClick={saveFolder} disabled={savingFolder}
              style={{ ...S.btnPrimary, minHeight: 36, pointerEvents: savingFolder ? 'none' : 'auto', opacity: savingFolder ? 0.5 : 1 }}>
              {savingFolder ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
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
    </div>
  );
}
