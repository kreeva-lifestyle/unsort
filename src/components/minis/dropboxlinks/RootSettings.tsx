// Admin settings for the Link Generator: the Dropbox folder links inside
// which SKU folders are searched. Toggle on/off, add, delete — nothing is
// stored until Save, which also verifies each enabled link against Dropbox
// and reports ✓ / ✗ per folder. Stored server-side in the app_secrets vault.
import { useState, useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call, GenRoot } from './api';

export default function RootSettings({ addToast, onChanged }: { addToast: (m: string, t?: string) => void; onChanged: () => void }) {
  const [roots, setRoots] = useState<GenRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    call({ action: 'linkgen_roots', op: 'list' })
      .then(({ data }) => { if (data.ok) setRoots(data.roots || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patch = (i: number, p: Partial<GenRoot>) => setRoots(rs => rs.map((r, j) => j === i ? { ...r, ...p, resolved: undefined, error: undefined } : r));

  const save = async () => {
    if (saving) return;
    const cleaned = roots.filter(r => r.url.trim());
    setSaving(true);
    try {
      const { data } = await call({ action: 'linkgen_roots', op: 'save', roots: cleaned });
      if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Save failed'), 'error'); setSaving(false); return; }
      setRoots(data.roots || []);
      const bad = (data.roots || []).filter((r: GenRoot) => r.resolved === false).length;
      addToast(bad === 0 ? 'Search folders saved' : `Saved — ${bad} folder link${bad === 1 ? '' : 's'} could not be opened, check below`, bad === 0 ? 'success' : 'error');
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 2 }}>Search Folders (admin)</div>
      <div style={{ fontSize: 10.5, color: T.tx3, marginBottom: 10 }}>Paste Dropbox folder links — SKU folders are searched inside the enabled ones. Changes apply on Save.</div>
      {loading && <div style={{ fontSize: 11, color: T.tx3, padding: '8px 0' }}>Loading…</div>}
      {!loading && roots.map((r, i) => (
        <div key={i} style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.bd}`, background: r.enabled ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.005)', opacity: r.enabled ? 1 : 0.55 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => patch(i, { enabled: !r.enabled })} title={r.enabled ? 'On — click to switch off' : 'Off — click to switch on'}
              style={{ ...S.btnSm, minWidth: 44, border: `1px solid ${r.enabled ? 'rgba(34,197,94,.4)' : T.bd2}`, background: r.enabled ? 'rgba(34,197,94,.12)' : 'transparent', color: r.enabled ? T.gr : T.tx3, cursor: 'pointer' }}>
              {r.enabled ? 'ON' : 'OFF'}
            </button>
            <input value={r.label} onChange={e => patch(i, { label: e.target.value })} placeholder="Name (e.g. ARYA)" style={{ ...S.fInput, width: 110 }} />
            <input value={r.url} onChange={e => patch(i, { url: e.target.value })} placeholder="https://www.dropbox.com/scl/fo/…" style={{ ...S.fInput, flex: 1, minWidth: 160, fontFamily: T.mono, fontSize: 11 }} />
            <button onClick={() => setRoots(rs => rs.filter((_, j) => j !== i))} title="Remove" style={{ background: 'none', border: 'none', color: T.re, fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '4px 6px' }}>&#215;</button>
          </div>
          {r.resolved === true && <div style={{ fontSize: 10, color: T.gr, marginTop: 4 }}>✓ Verified{r.path ? ` — ${r.path}` : ''}</div>}
          {r.resolved === false && <div style={{ fontSize: 10, color: T.re, marginTop: 4 }}>✗ Dropbox cannot open this link{r.error ? ` (${r.error})` : ''} — check it and Save again</div>}
        </div>
      ))}
      {!loading && roots.length === 0 && <div style={{ fontSize: 11, color: T.tx3, padding: '6px 0 10px' }}>No search folders yet — add the first one below.</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => setRoots(rs => [...rs, { label: '', url: '', enabled: true }])} style={S.btnGhost}>+ Add Folder</button>
        <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
