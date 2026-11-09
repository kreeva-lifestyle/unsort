// "Problem signing in? Details": the last few errors this page hit, from the
// in-memory ring that friendlyError and the error logger feed. Nothing before
// sign-in reaches a support screen otherwise, so this is what staff read out
// (or screenshot) when they report "it won't let me in". Messages only — the
// ring holds gotrue / HTTP text, never tokens or passwords.
import { useState } from 'react';
import { T } from '../../lib/theme';
import { recentErrors } from '../../lib/recentErrors';

const time = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };

export default function SignInDetails({ tick }: { tick: number }) {
  const [open, setOpen] = useState(false);
  // `tick` changes on every failure so the list re-reads the ring.
  void tick;
  const items = recentErrors().slice().reverse();
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 14, textAlign: 'center' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', minHeight: 44, padding: '12px 10px', fontFamily: T.sans }}>
        Problem signing in? {open ? 'Hide details' : 'Details'}
      </button>
      {open && (
        <ul aria-label="Recent sign-in errors" style={{ listStyle: 'none', margin: '2px 0 0', padding: '8px 10px', textAlign: 'left', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, fontFamily: T.mono, fontSize: 10, color: T.tx3, lineHeight: 1.5, maxHeight: 120, overflowY: 'auto', wordBreak: 'break-word' }}>
          {items.map((e, i) => <li key={`${e.at}-${i}`}><span style={{ color: T.tx2 }}>{time(e.at)}</span> {e.message}</li>)}
        </ul>
      )}
    </div>
  );
}
