// Who did what on a job, and when — the audit trail (created, edited,
// sent, received, paid, closed, reopened, cancelled, deletions), newest
// first. Every row is stamped server-side with the actor and the real
// time, so a receipt dated last week still shows the day it was keyed in.
import { useState } from 'react';
import { T, S, Pill } from '../../lib/theme';
import { fmtWhen, initials, type JobActivityRow } from './jobworkModel';

const SHOW = 8;
const ACTIONS: Record<string, { label: string; tone: 'neutral' | 'gr' | 'yl' | 're' | 'bl' | 'ac' }> = {
  CREATE: { label: 'Created', tone: 'ac' }, UPDATE: { label: 'Edited', tone: 'ac' },
  SEND: { label: 'Sent out', tone: 'bl' }, RECEIVE: { label: 'Received', tone: 'gr' },
  PAYMENT: { label: 'Paid', tone: 'gr' }, PAYMENT_DELETE: { label: 'Payment deleted', tone: 're' },
  ENTRY_DELETE: { label: 'Entry deleted', tone: 're' },
  CLOSED: { label: 'Closed', tone: 'yl' }, CANCELLED: { label: 'Cancelled', tone: 're' }, OPEN: { label: 'Reopened', tone: 'neutral' },
};

export default function JobActivity({ rows, jwNumber, onRetry }: {
  /** null while loading; 'error' when the read failed (the job itself is up). */
  rows: JobActivityRow[] | null | 'error';
  jwNumber: number;
  onRetry: () => void;
}) {
  const [all, setAll] = useState(false);
  if (rows === null) return <div style={{ fontSize: 11, color: T.tx3, padding: '6px 0' }}>Loading…</div>;
  if (rows === 'error') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '2px 0' }}>
      <span style={{ fontSize: 11, color: T.tx3 }}>Could not load the activity.</span>
      <button type="button" onClick={onRetry} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44 }}>Try again</button>
    </div>
  );
  if (rows.length === 0) return <div style={{ fontSize: 11, color: T.tx3, padding: '6px 0' }}>No activity recorded yet.</div>;
  const shown = all ? rows : rows.slice(0, SHOW);
  // Rows say "JW #12 — sent out"; on JW #12's own page the prefix is noise.
  const strip = (d: string | null) => (d ?? '').replace(new RegExp(`^JW #${jwNumber} — `), '');
  return (
    <div>
      {shown.map((r, i) => {
        const a = ACTIONS[r.action] ?? { label: r.action, tone: 'neutral' as const };
        const who = r.user_email || 'System';
        return (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
            <span title={who} aria-hidden style={{ width: 28, height: 28, borderRadius: 999, background: T.ac3, color: T.ac2, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em' }}>{initials(who)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{who}</span>
                <Pill tone={a.tone} style={{ fontSize: 10 }}>{a.label}</Pill>
              </div>
              {strip(r.details) && <div style={{ fontSize: 11, color: T.tx3, marginTop: 3, lineHeight: 1.5 }}>{strip(r.details)}</div>}
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, whiteSpace: 'nowrap', paddingTop: 7, flexShrink: 0 }}>{fmtWhen(r.created_at)}</span>
          </div>
        );
      })}
      {rows.length > SHOW && (
        <button type="button" onClick={() => setAll(a => !a)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, marginTop: 8 }}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
