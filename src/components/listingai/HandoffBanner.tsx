// Persistent context strip above the SKU box: where the pasted SKUs came
// from (Master Assistant handoff) and, while the auto-run queue is active,
// which batch is running — with a Stop control. A toast vanishes in seconds;
// this stays until the owner dismisses it or the queue ends.
import { T, S } from '../../lib/theme';

export default function HandoffBanner({ seller, count, batch, stopping, onStop, onDismiss }: {
  seller: string | null; count: number;
  batch: { current: number; total: number } | null;
  stopping: boolean;
  onStop: () => void; onDismiss: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: T.ac3, border: `1px solid ${T.bd2}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: T.tx }}>
      <div style={{ flex: 1, minWidth: 180, lineHeight: 1.5 }}>
        {seller && (
          <div><b>{count} not-uploaded SKU{count === 1 ? '' : 's'} from {seller}</b> — pick that seller&rsquo;s Listing Template, or add it via Manage Templates.</div>
        )}
        {batch && (
          <div style={{ color: T.tx2 }}>
            Auto-run: batch {batch.current} of {batch.total}. Stop ends the queue after this batch; cancelling a pre-check skips only that batch.
          </div>
        )}
      </div>
      {batch && (
        <button onClick={onStop} style={{ ...S.btnDanger, ...S.btnSm, opacity: stopping ? 0.5 : 1, pointerEvents: stopping ? 'none' : 'auto' }}>
          {stopping ? 'Stopping…' : 'Stop'}
        </button>
      )}
      {!batch && (
        <span onClick={onDismiss} aria-label="Dismiss" style={{ cursor: 'pointer', color: T.tx3, fontSize: 16, lineHeight: 1, padding: '4px 6px' }}>&#215;</span>
      )}
    </div>
  );
}
