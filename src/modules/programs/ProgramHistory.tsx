import { useState, useEffect } from 'react';
import { T } from '../../lib/theme';
import { fetchHistory } from './lib/supabase-rpc';
import type { ProgramHistoryEntry } from './types';
import type { TranslationKey } from './i18n/en';

interface Props { programId: string; t: (key: TranslationKey) => string }

const ACTION_COLORS: Record<string, string> = {
  create: T.gr, update: T.yl, delete: T.re, hard_delete: T.re,
  price_update: T.ac2, voice_upload: T.bl,
};

export default function ProgramHistory({ programId, t }: Props) {
  const [entries, setEntries] = useState<ProgramHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await fetchHistory(programId);
      setEntries(data);
      setLoading(false);
    })();
  }, [programId]);

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>{t('loading')}</div>;
  if (entries.length === 0) return <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>{t('noHistory')}</div>;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora, marginBottom: 10 }}>{t('history')}</div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        {entries.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, marginTop: 4, flexShrink: 0, background: ACTION_COLORS[e.action] || T.tx3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: T.tx, textTransform: 'capitalize' }}>{e.action.replace('_', ' ')}</span>
                {e.field_changed && <span style={{ color: T.tx3, fontFamily: T.mono }}>{e.field_changed}</span>}
                {e.user_email && <span style={{ color: T.tx3 }}>by {e.user_email}</span>}
              </div>
              {e.old_value != null && e.new_value != null && (
                <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>
                  <span style={{ color: T.re }}>{String(JSON.stringify(e.old_value))}</span>
                  {' → '}
                  <span style={{ color: T.gr }}>{String(JSON.stringify(e.new_value))}</span>
                </div>
              )}
              {e.action === 'create' && e.new_value != null && (
                <div style={{ fontSize: 9, color: T.tx3, marginTop: 2 }}>{JSON.stringify(e.new_value) as string}</div>
              )}
            </div>
            <span style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono, whiteSpace: 'nowrap', marginTop: 2 }}>
              {new Date(e.changed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              {' '}
              {new Date(e.changed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
