// Best-effort append-only audit trail for Purchase Orders.
// Mirrors ccAuditLog in CashChallan — writes to the shared `audit_log`
// table with module='purchase_order'. Never blocks the main operation:
// a failed audit write goes to the error log (Settings → Error Logs).
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';

export const poAuditLog = async (
  action: string,
  recordId: string,
  details: string,
  changes?: Record<string, { from: unknown; to: unknown }>,
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let userName = user?.email || null;
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      userName = prof?.full_name || userName;
    }
    const { error } = await supabase.from('audit_log').insert({
      action, module: 'purchase_order', record_id: recordId, details,
      user_id: user?.id ?? null, user_email: userName, changes: changes || null,
    });
    if (error) logSwallowed('PO audit log', error);
  } catch { /* audit is best-effort — never block the main operation */ }
};
