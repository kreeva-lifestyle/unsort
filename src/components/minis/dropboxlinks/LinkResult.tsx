// Single-SKU result card: candidates (multi-folder disambiguation), the
// generated links (thumbnail + Copy/Open), Copy-all, and — for admin/manager/
// operator — a one-tap "Save to master sheet" that writes the folder link into
// the SKU's IMAGE column. Split out of DropboxLinkGenerator to stay within the
// file budget.
import { T, S } from '../../../lib/theme';
import { thumbUrl, GenResult } from './api';

const IMG_RE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

export default function LinkResult({ result, saveUrl, canSave, saving, busy, onPickCandidate, onCopy, onSave }: {
  result: GenResult;
  saveUrl?: string;
  canSave: boolean;
  saving: boolean;
  busy: boolean;
  onPickCandidate: (path: string) => void;
  onCopy: (text: string, what?: string) => void;
  onSave: (url: string) => void;
}) {
  const links = result.links || [];
  const goodLinks = links.filter(l => l.url);
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${result.ok ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, borderRadius: 10, padding: 14, marginBottom: 12, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.mono, color: T.tx, flex: 1 }}>{result.sku}</div>
        {result.ok && saveUrl && canSave && (
          <button onClick={() => onSave(saveUrl)} disabled={saving} title="Write this folder link into the master sheet's IMAGE column"
            style={{ ...S.btnGhost, padding: '5px 11px', fontSize: 10, color: T.bl, border: '1px solid rgba(56,189,248,.25)', background: 'rgba(56,189,248,.06)', pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save to sheet'}
          </button>
        )}
      </div>
      {result.folder && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2, marginBottom: 8 }}>{result.folder}</div>}
      {!result.ok && <div style={{ fontSize: 11, color: result.candidates?.length ? T.yl : T.re, lineHeight: 1.6, marginTop: 6 }}>{result.error}</div>}
      {(result.candidates || []).map((c, i) => (
        <button key={i} onClick={() => onPickCandidate(c.path)} disabled={busy}
          style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: '9px 12px', fontSize: 11, fontFamily: T.mono, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
          📁 {c.display}
        </button>
      ))}
      {links.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: i > 0 ? `1px solid ${T.bd}` : 'none' }}>
          {l.url && IMG_RE.test(l.name) && (
            <img src={thumbUrl(l.url)} alt="" loading="lazy"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.03)', flexShrink: 0 }} />
          )}
          <span style={{ flex: 1, fontSize: 11, color: T.tx2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
          {l.url ? <>
            <button onClick={() => onCopy(l.url)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10 }}>Copy</button>
            <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.bl }}>Open</a>
          </> : <span style={{ fontSize: 10, color: T.re }}>{l.error || 'failed'}</span>}
        </div>
      ))}
      {result.ok && goodLinks.length > 1 && (
        <button onClick={() => onCopy(goodLinks.map(l => l.url).join('\n'), 'All links')} style={{ ...S.btnGhost, marginTop: 8, padding: '4px 10px', fontSize: 10 }}>Copy all</button>
      )}
      {result.note && <div style={{ fontSize: 10, color: T.yl, marginTop: 8 }}>{result.note}</div>}
    </div>
  );
}
