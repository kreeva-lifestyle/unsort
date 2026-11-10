// Products → Needs info (also where the dashboard's Needs-info tile leads):
// "N products wait for a tag" with "Let AI decide for N products" — queues
// them for the values-only AI pass (tags_ai_fill), which the automation runs
// a few at a time; they move to Ready as their tags arrive. Two signals:
// "Queuing…" on the button, then a toast. Hidden when nothing waits.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { logSwallowed } from '../../../../lib/errorLogger';
import type { AddToast } from '../../PbToasts';
import { aiFill, countMissingTags } from '../../../data/tags';
import { PB, pbNum } from '../../../pbTheme';
import { PbButton, PbTile } from '../../ui';
import { Dot } from '../status';

export default function MissingTagsBar({ addToast, onQueued, count: given }: { addToast: AddToast; onQueued: () => void; count?: number }) {
  const [n, setN] = useState<number | null>(given ?? null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    countMissingTags().then(c => { if (live) setN(c); }).catch(e => logSwallowed('count missing tags', e));
    return () => { live = false; };
  }, [given]);
  if (!n) return null;
  const go = async () => {
    setBusy(true);
    try {
      const q = await aiFill({ needs_info: true });
      setQueued(true);
      addToast(q ? `AI is choosing tags for ${q.toLocaleString('en-IN')} product${q === 1 ? '' : 's'} — they move to Ready as it goes` : 'They are already waiting for the AI', 'success');
      onQueued();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <PbTile variant="review" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <Dot color={PB.review} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal', flex: '1 1 220px' }}
        label={queued ? 'Queued — the AI fills them in the background' : <><span style={pbNum}>{n.toLocaleString('en-IN')}</span> {n === 1 ? 'product waits' : 'products wait'} for a required tag</>} />
      {!queued && <PbButton icon="sparkles" style={{ whiteSpace: 'normal', padding: '8px 16px' }} onClick={() => void go()} busy={busy} busyLabel="Queuing…">Let AI decide for {n.toLocaleString('en-IN')} {n === 1 ? 'product' : 'products'}</PbButton>}
    </PbTile>
  );
}
