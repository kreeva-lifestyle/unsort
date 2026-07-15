// Admin-only card: store the Anthropic API key server-side (app_secrets vault
// via the edge function). The key is validated against Anthropic before it is
// saved and never reaches the browser bundle or client-readable tables.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { call } from './api';

export default function KeyCard({ hasKey, onSaved, addToast }: {
  hasKey: boolean;
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
      const { status, data } = await call({ action: 'set_key', key: key.trim() });
      if (data?.ok) { addToast('API key saved', 'success'); setEditing(false); setKey(''); onSaved(); }
      else addToast(String(data?.details || data?.error || `Failed (${status})`), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasKey ? T.gr : T.yl, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: T.tx2, flex: 1, minWidth: 180 }}>
          {hasKey ? 'Anthropic API key is set — generation is ready.' : 'No Anthropic API key yet — add one from console.anthropic.com to start generating.'}
        </span>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ ...S.btnGhost, ...S.btnSm }}>{hasKey ? 'Replace key' : 'Add key'}</button>
        )}
      </div>
      {editing && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            placeholder="sk-ant-…"
            type="password"
            autoComplete="off"
            style={{ ...S.fInput, flex: 1, minWidth: 200, fontFamily: T.mono }}
          />
          <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, ...S.btnSm, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setEditing(false); setKey(''); }} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
