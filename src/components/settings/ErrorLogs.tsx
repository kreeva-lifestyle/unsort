import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import Empty from '../ui/Empty';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import { SkeletonRows } from '../ui/Skeleton';

interface ErrorLog {
  id: string;
  message: string;
  stack: string | null;
  source: string;
  url: string | null;
  user_agent: string | null;
  user_email: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;
const SOURCE_COLORS: Record<string, string> = { boundary: T.re, window: T.yl, promise: T.bl, manual: T.tx3 };

export default function ErrorLogs({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const { ask, modalProps } = useConfirm();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, count, error } = await supabase
      .from('error_logs')
      .select('id, message, stack, source, url, user_agent, user_email, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) { addToast('Failed to load error logs — ' + friendlyError(error), 'error'); setLoading(false); return; }
    setLogs((data as ErrorLog[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, addToast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const clearAll = async () => {
    if (!(await ask({ title: 'Clear all error logs?', message: 'This permanently deletes every logged error. This cannot be undone.', danger: true, confirmLabel: 'Clear all' }))) return;
    setClearing(true);
    const { error } = await supabase.from('error_logs').delete().not('id', 'is', null);
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Error logs cleared', 'success'); setPage(0); fetchLogs(); }
    setClearing(false);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 4 }}>Error Logs</div>
          <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>Unhandled crashes, exceptions, and promise rejections captured across the app.</div>
        </div>
        {total > 0 && <button onClick={clearAll} disabled={clearing} style={{ ...S.btnDanger, ...S.btnSm, pointerEvents: clearing ? 'none' : 'auto', opacity: clearing ? 0.5 : 1 }}>{clearing ? 'Clearing…' : 'Clear all'}</button>}
      </div>

      {loading && logs.length === 0 && <SkeletonRows rows={4} />}
      {!loading && logs.length === 0 && <Empty icon="warning" title="No errors logged" message="Nothing has crashed. When an unexpected error happens, it'll show up here with its stack trace." />}

      {logs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => {
            const isOpen = expanded === log.id;
            return (
              <div key={log.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : log.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 7px', borderRadius: 4, background: `${SOURCE_COLORS[log.source] || T.tx3}22`, color: SOURCE_COLORS[log.source] || T.tx3 }}>{log.source}</span>
                  <span style={{ fontSize: 12, color: T.tx, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isOpen ? 'normal' : 'nowrap' }}>{log.message}</span>
                  <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: T.tx3, flexWrap: 'wrap' }}>
                  {log.user_email && <span>{log.user_email}</span>}
                  {log.url && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isOpen ? 'none' : 240 }}>{log.url.replace(/^https?:\/\/[^/]+/, '')}</span>}
                </div>
                {isOpen && log.stack && <pre style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontSize: 10, color: T.tx2, fontFamily: T.mono, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{log.stack}</pre>}
                {isOpen && log.user_agent && <div style={{ marginTop: 6, fontSize: 9, color: T.tx3, fontFamily: T.mono }}>{log.user_agent}</div>}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <span onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</span>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages} · {total} total</span>
          <span onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }}>Next</span>
        </div>
      )}

      <ConfirmModal {...modalProps} />
    </div>
  );
}
