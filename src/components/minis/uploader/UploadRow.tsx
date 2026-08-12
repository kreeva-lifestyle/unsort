// One queued file: name, size, live progress bar, outcome, and the action
// that makes sense for its state (cancel while running, retry after a failure,
// remove before it starts). Split out of DropboxUploader for the file budget.
import { T, S } from '../../../lib/theme';
import { humanBytes, type UpItem } from './api';

const BAR: Record<string, string> = { done: T.gr, error: T.re, cancelled: T.tx3 };

export default function UploadRow({ item, onCancel, onRetry, onRemove }: {
  item: UpItem;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const running = item.state === 'uploading';
  const label = item.state === 'done' ? 'Uploaded'
    : item.state === 'error' ? 'Failed'
      : item.state === 'cancelled' ? 'Cancelled'
        : running ? `${item.pct}%` : 'Ready';

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: T.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>
            {humanBytes(item.file.size)} · <span style={{ color: item.state === 'done' ? T.gr : item.state === 'error' ? T.re : T.tx3 }}>{label}</span>
          </div>
        </div>
        {running && <button onClick={onCancel} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, color: T.re }}>Stop</button>}
        {(item.state === 'error' || item.state === 'cancelled') && <button onClick={onRetry} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, color: T.ac2 }}>Retry</button>}
        {(item.state === 'queued' || item.state === 'done' || item.state === 'error' || item.state === 'cancelled') && (
          <span onClick={onRemove} aria-label="Remove" title="Remove from the list" style={{ cursor: 'pointer', color: T.tx3, fontSize: 16, lineHeight: 1, padding: '4px 6px' }}>&#215;</span>
        )}
      </div>

      {/* The bar stays visible after the fact: a finished row reading 100% in
          green is the receipt that the file really went. */}
      {item.state !== 'queued' && (
        <div style={{ height: 5, borderRadius: 3, background: T.glass2, overflow: 'hidden', marginTop: 8 }}>
          <div style={{ width: `${item.state === 'done' ? 100 : item.pct}%`, height: '100%', background: BAR[item.state] || T.ac, transition: 'width .2s linear' }} />
        </div>
      )}

      {item.state === 'done' && item.path && (
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, wordBreak: 'break-all' }}>{item.path}</div>
      )}
      {item.state === 'error' && item.message && (
        <div style={{ fontSize: 10.5, color: T.re, marginTop: 6, lineHeight: 1.5 }}>{item.message}</div>
      )}
    </div>
  );
}
