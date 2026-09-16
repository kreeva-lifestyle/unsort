// The PO detail's activity timeline — audit rows, newest first, each with
// who did it (poAudit stores the profile's full name in `user_email`,
// falling back to the sign-in email). Split out of PODetail so that file
// stays under the 200-line limit.
import { T } from '../../lib/theme';
import type { AuditLog } from '../../types/database';

export default function POActivity({ audit }: { audit: AuditLog[] | null }) {
  if (!audit || audit.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Activity</div>
      {audit.map(a => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '5px 0', fontSize: 11 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: T.ac3, color: T.ac2, fontWeight: 700, marginRight: 6 }}>{a.action}</span>
            <span style={{ color: T.tx2 }}>{a.details}</span>
            {a.user_email && <span style={{ fontSize: 9, color: T.tx3, marginLeft: 6, whiteSpace: 'nowrap' }}>by {a.user_email}</span>}
          </div>
          <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, flexShrink: 0, paddingTop: 2 }}>{a.created_at ? new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        </div>
      ))}
    </div>
  );
}
