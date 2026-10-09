// Who did what, and when — one record's audit trail (audit_log rows),
// newest first: an initials avatar, the person, the action as a pill, the
// detail line and the real time it was keyed in. The database stamps the
// actor and the moment, never the client, so a receipt dated last week
// still shows the day it was entered. The caller names its actions and
// strips its own record prefix ("JW #12 — ") from the detail line.
import { useState } from 'react';
import { T, S, Pill } from '../../lib/theme';
import { fmtWhen, initials } from '../../lib/humanize';

export interface ActivityRow { id: string; action: string; details: string | null; user_email: string | null; created_at: string | null }
export type ActivityTone = 'neutral' | 'gr' | 'yl' | 're' | 'bl' | 'ac';
export interface ActionMeta { label: string; tone: ActivityTone }

export default function ActivityList({ rows, actions, strip, onRetry, show = 8 }: {
  /** null while loading; 'error' when the read failed (the record itself is up). */
  rows: ActivityRow[] | null | 'error';
  actions: Record<string, ActionMeta>;
  /** Drops the record's own prefix from a detail line. */
  strip?: (details: string | null) => string;
  onRetry: () => void;
  /** Rows before "Show all N". */
  show?: number;
}) {
  const [all, setAll] = useState(false);
  const muted: React.CSSProperties = { fontSize: 11, color: T.tx3, padding: '6px 0' };
  if (rows === null) return <div style={muted}>Loading…</div>;
  if (rows === 'error') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '2px 0' }}>
      <span style={{ fontSize: 11, color: T.tx3 }}>Could not load the activity.</span>
      <button type="button" onClick={onRetry} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44 }}>Try again</button>
    </div>
  );
  if (rows.length === 0) return <div style={muted}>No activity recorded yet.</div>;
  const shown = all ? rows : rows.slice(0, show);
  return (
    <div>
      {shown.map((r, i) => {
        const a = actions[r.action] ?? { label: r.action, tone: 'neutral' as const };
        const who = r.user_email || 'System';
        const text = strip ? strip(r.details) : (r.details ?? '');
        // "approved" under an Approved pill says nothing new.
        const detail = text.trim().toLowerCase() === a.label.toLowerCase() ? '' : text;
        return (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
            <span title={who} aria-hidden style={{ width: 28, height: 28, borderRadius: 999, background: T.ac3, color: T.ac2, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em' }}>{initials(who)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{who}</span>
                <Pill tone={a.tone} style={{ fontSize: 10 }}>{a.label}</Pill>
              </div>
              {detail && <div style={{ fontSize: 11, color: T.tx3, marginTop: 3, lineHeight: 1.5 }}>{detail}</div>}
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, whiteSpace: 'nowrap', paddingTop: 7, flexShrink: 0 }}>{fmtWhen(r.created_at)}</span>
          </div>
        );
      })}
      {rows.length > show && (
        <button type="button" onClick={() => setAll(a => !a)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44, marginTop: 8 }}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
