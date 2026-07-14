// The single shared Dropbox folder that document photos upload into.
// Any signed-in user can set it (mirrors the Link Generator's folders).
import { useState, useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../dropboxlinks/api';

interface SavedFolder { url: string; path?: string; display?: string; resolved?: boolean }

export default function FwdSettings({ addToast, onChanged }: { addToast: (m: string, t?: string) => void; onChanged: () => void }) {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<SavedFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    call({ action: 'fwd_folder', op: 'list' })
      .then(({ data }) => { if (data.ok && data.folder) { setSaved(data.folder); setUrl(data.folder.url || ''); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // saveUrl === '' clears the folder (the Save button requires a non-empty URL,
  // so clearing gets its own button — without it a set folder could only ever
  // be replaced, never removed).
  const save = async (saveUrl?: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await call({ action: 'fwd_folder', op: 'save', url: (saveUrl ?? url).trim() });
      if (data?.error === 'dropbox_not_connected') { addToast('Dropbox is not connected — an admin can connect it in Trackly → Image Link Check', 'error'); setSaving(false); return; }
      if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Could not save the folder'), 'error'); setSaving(false); return; }
      setSaved(data.folder || null);
      if (!data.folder) setUrl('');
      addToast(data.folder ? 'Upload folder saved' : 'Upload folder cleared', 'success');
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 10 }}>
        <label style={S.fLabel}>Dropbox folder link</label>
        <input value={url} onChange={e => { setUrl(e.target.value); setSaved(null); }} placeholder="https://www.dropbox.com/scl/fo/…" style={{ ...S.fInput, width: '100%', fontFamily: T.mono, fontSize: 11 }} />
        {saved?.resolved && <div style={{ fontSize: 11, color: T.gr, marginTop: 6 }}>✓ Verified — {saved.display || saved.path}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => save()} disabled={saving || !url.trim()} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving || !url.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save folder'}</button>
        {(saved || url.trim()) && <button onClick={() => save('')} disabled={saving} style={{ ...S.btnDanger, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>Clear</button>}
      </div>
      <div style={{ fontSize: 11, color: T.tx3, marginTop: 10, lineHeight: 1.5 }}>
        Photos from every user upload into this one folder. <b style={{ color: T.tx2 }}>Any signed-in user can set it.</b>
      </div>
      {loading && <div style={{ fontSize: 11, color: T.tx3, marginTop: 8 }}>Loading…</div>}
    </div>
  );
}
