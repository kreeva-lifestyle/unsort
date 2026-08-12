// Browse the WHOLE Dropbox to choose a destination: breadcrumb + one level of
// subfolders at a time, with the configured folders offered as quick jumps.
// The folder you are standing in IS the destination — shown in full above the
// list, so "where will this land" is never a guess.
import { useState, useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../dropboxlinks/api';
import type { UpFolder } from './api';

interface Crumb { name: string; path: string }
const ROOT: Crumb = { name: 'Dropbox', path: '' };

export default function FolderPicker({ shortcuts, disabled, onPick }: {
  shortcuts: UpFolder[];
  disabled: boolean;
  onPick: (path: string, label: string) => void;
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT]);
  const [folders, setFolders] = useState<Crumb[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const cur = crumbs[crumbs.length - 1];

  useEffect(() => {
    let stale = false;
    setFolders(null); setError(''); setTruncated(false);
    call({ action: 'up_browse', path: cur.path }).then(({ status, data }) => {
      if (stale) return;
      const d = data as Record<string, unknown>;
      if (d?.ok) { setFolders((d.folders as Crumb[]) || []); setTruncated(!!d.truncated); }
      else setError(String(d?.error) === 'dropbox_not_connected'
        ? 'Dropbox is not connected — an admin can connect it in Trackly → Image Link Check.'
        : String(d?.details || d?.error || `Could not open that folder (${status})`));
    }).catch(e => { if (!stale) setError(friendlyError(e)); });
    return () => { stale = true; };
  }, [cur.path]);

  // Report the destination on every move, so the parent never has to guess.
  useEffect(() => { onPick(cur.path, crumbs.map(c => c.name).join(' / ')); }, [cur.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (c: Crumb) => { if (!disabled) setCrumbs(prev => [...prev, c]); };
  const jump = (f: UpFolder) => { if (!disabled) setCrumbs([ROOT, { name: f.label, path: f.path }]); };

  return (
    <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, background: 'rgba(0,0,0,.15)', overflow: 'hidden', opacity: disabled ? 0.6 : 1 }}>
      {shortcuts.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${T.bd}`, overflowX: 'auto', scrollbarWidth: 'none' as const }}>
          {shortcuts.map(f => (
            <button key={f.path} onClick={() => jump(f)} disabled={disabled}
              style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, whiteSpace: 'nowrap' }}>{f.label}</button>
          ))}
        </div>
      )}

      {/* Breadcrumb — every level is a way back. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '8px 10px', borderBottom: `1px solid ${T.bd}` }}>
        {crumbs.map((c, i) => (
          <span key={c.path + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: T.tx3, fontSize: 11 }}>/</span>}
            <span onClick={() => !disabled && i < crumbs.length - 1 && setCrumbs(crumbs.slice(0, i + 1))}
              style={{ fontSize: 11, fontWeight: i === crumbs.length - 1 ? 700 : 500, color: i === crumbs.length - 1 ? T.ac2 : T.tx3, cursor: i < crumbs.length - 1 && !disabled ? 'pointer' : 'default', padding: '2px 2px' }}>
              {c.name}
            </span>
          </span>
        ))}
      </div>

      <div style={{ maxHeight: 230, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {folders === null && !error && <div style={{ padding: 18, textAlign: 'center', fontSize: 11, color: T.tx3 }}>Opening…</div>}
        {error && <div style={{ padding: '10px 12px', fontSize: 11, color: T.re, lineHeight: 1.5 }}>{error}</div>}
        {folders?.length === 0 && !error && (
          <div style={{ padding: 18, textAlign: 'center', fontSize: 11, color: T.tx3 }}>No subfolders here — files will land in this folder.</div>
        )}
        {(folders || []).map(f => (
          <div key={f.path} onClick={() => go(f)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: `1px solid ${T.bd}`, cursor: disabled ? 'default' : 'pointer', minHeight: 44 }}>
            <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', flexShrink: 0 }}>
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <span style={{ flex: 1, fontSize: 12, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            <span style={{ fontSize: 15, color: T.tx3, lineHeight: 1 }}>&rsaquo;</span>
          </div>
        ))}
        {truncated && <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.bd}`, fontSize: 10, color: T.yl }}>This folder has more subfolders than could be listed — use a quick jump above, or type the rest in the subfolder box.</div>}
      </div>
    </div>
  );
}
