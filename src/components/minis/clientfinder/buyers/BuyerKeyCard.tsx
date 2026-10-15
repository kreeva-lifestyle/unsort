// Admin-only: store the Brave Search API key server-side (app_secrets through
// the edge function, validated with one real search before it is saved). The
// key never reaches the browser bundle.
import { useState } from 'react';
import { T, S } from '../../../../lib/theme';
import { friendlyError } from '../../../../lib/friendlyError';
import { call, explain } from './buyerApi';

export default function BuyerKeyCard({ hasKey, isAdmin, onSaved, addToast }: {
  hasKey: boolean;
  isAdmin: boolean;
  /** Called after any save attempt (the test search counts even when the key is refused). */
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!key.trim()) { addToast('Paste the API key first', 'error'); return; }
    setSaving(true);
    try {
      const { status, data } = await call({ action: 'set_search_key', key: key.trim() });
      if (data?.ok) { addToast('Brave key saved — a test search worked', 'success'); setEditing(false); setKey(''); }
      else addToast(explain(data, status), 'error');
      onSaved();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasKey ? T.gr : T.yl, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: T.tx2, flex: 1, minWidth: 180 }}>
          {hasKey ? 'Brave Search API key is set.' : isAdmin ? 'No Brave Search API key yet — add one to start finding buyers.' : 'No Brave Search API key yet — ask an admin to add one.'}
        </span>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44 }}>{hasKey ? 'Replace key' : 'Add key'}</button>
        )}
      </div>
      {editing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, color: T.tx3, lineHeight: 1.6, marginBottom: 8 }}>
            Sign up at api.search.brave.com, pick the Free plan on the Web Search API (1,000 searches a month), create a key under API Keys and paste it here. Saving runs one test search, which counts as one of the month's 1,000.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="BSA…" type="password" autoComplete="off" style={{ ...S.fInput, flex: 1, minWidth: 180, fontFamily: T.mono }} />
            <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Testing…' : 'Save'}</button>
            <button onClick={() => { setEditing(false); setKey(''); }} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
