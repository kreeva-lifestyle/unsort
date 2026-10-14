// Admin-only: store the search API key server-side (app_secrets through the
// edge function, validated with one real query before it is saved). Brave
// Search needs one key; Google Programmable Search needs a key plus the
// engine id (cx). The key never reaches the browser bundle.
import { useState, useEffect } from 'react';
import { T, S } from '../../../../lib/theme';
import { friendlyError } from '../../../../lib/friendlyError';
import { call, explain, type SearchProvider } from './buyerApi';

export default function BuyerKeyCard({ provider, isAdmin, onSaved, addToast }: {
  provider: SearchProvider | null;
  isAdmin: boolean;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<SearchProvider>(provider || 'brave');
  const [key, setKey] = useState('');
  const [cx, setCx] = useState('');
  const [saving, setSaving] = useState(false);
  // The configured provider arrives after the status call; the picker
  // follows it so "Replace key" tests the new key against the right API.
  useEffect(() => { if (provider) setChoice(provider); }, [provider]);

  const save = async () => {
    if (saving) return;
    if (!key.trim()) { addToast('Paste the API key first', 'error'); return; }
    if (choice === 'google' && !cx.trim()) { addToast('Google also needs the search engine id (cx)', 'error'); return; }
    setSaving(true);
    try {
      const { status, data } = await call({ action: 'set_search_key', provider: choice, key: key.trim(), cx: cx.trim() });
      if (data?.ok) { addToast('Search key saved — a test search worked', 'success'); setEditing(false); setKey(''); setCx(''); onSaved(); }
      else addToast(explain(data, status), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const label = provider === 'brave' ? 'Brave Search' : provider === 'google' ? 'Google Programmable Search' : null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: provider ? T.gr : T.yl, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: T.tx2, flex: 1, minWidth: 180 }}>
          {label ? `Search API: ${label} is set.` : isAdmin ? 'No search API key yet — add one to start finding buyers.' : 'No search API key yet — ask an admin to add one.'}
        </span>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44 }}>{provider ? 'Replace key' : 'Add key'}</button>
        )}
      </div>
      {editing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, color: T.tx3, lineHeight: 1.6, marginBottom: 8 }}>
            Brave: sign up at api.search.brave.com (free plan: 2,000 searches a month). Google: enable the Custom Search API in Google Cloud, create a Programmable Search Engine set to search the whole web, and paste its id as cx (free: 100 searches a day).
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={choice} onChange={e => setChoice(e.target.value as SearchProvider)} style={{ ...S.fInput, width: 'auto' }}>
              <option value="brave">Brave Search</option>
              <option value="google">Google Programmable Search</option>
            </select>
            <input value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="API key" type="password" autoComplete="off" style={{ ...S.fInput, flex: 1, minWidth: 180, fontFamily: T.mono }} />
            {choice === 'google' && (
              <input value={cx} onChange={e => setCx(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }}
                placeholder="Search engine id (cx)" autoComplete="off" style={{ ...S.fInput, flex: 1, minWidth: 160, fontFamily: T.mono }} />
            )}
            <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Testing…' : 'Save'}</button>
            <button onClick={() => { setEditing(false); setKey(''); setCx(''); }} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
