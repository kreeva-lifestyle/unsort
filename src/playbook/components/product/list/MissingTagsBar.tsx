// Products → Needs info (also where the dashboard's Needs-info tile leads): the AI choosing tags, as the server sees it
// (owner, 18 Nov 2026: "the queue on refresh vanishes and does not give clarity whether its done or not").
//   • The "Let AI decide" batch (FillProgress, as on the Tags page): done of total with a bar, what is left and about
//     how long, or why it waits; once over, "Done" with how many got their tags and when it finished, for 12 hours.
//     Read from the server (tags_fill_status), so a refresh shows it again; asked again every 8 s while it runs, and
//     the list reloads when it ends.
//   • "N products wait for a required tag" with "Let AI decide for N products": only the ones not already in a batch
//     (the ones the button takes). Two signals: "Queuing…" on the button, then a toast and the batch's progress.
// Hidden when nothing waits and no batch ran in the last 12 hours.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { logSwallowed } from '../../../../lib/errorLogger';
import type { AddToast } from '../../PbToasts';
import { aiFill, countMissingTags, fillStatus } from '../../../data/tags';
import type { PbFillRun } from '../../../tagTypes';
import { PB, pbNum } from '../../../pbTheme';
import { PbButton, PbTile } from '../../ui';
import FillProgress from '../../tags/FillProgress';
import { Dot } from '../status';

const SHOW_DONE_MS = 12 * 3600_000;
const POLL_MS = 8000;

/** The server calls (a fake one for the screenshot harness). */
export interface MissingTagsApi { count: () => Promise<number>; status: () => Promise<PbFillRun | null>; queue: () => Promise<number> }
const LIVE: MissingTagsApi = { count: countMissingTags, status: fillStatus, queue: () => aiFill({ needs_info: true }) };

export default function MissingTagsBar({ addToast, onQueued, api = LIVE }: { addToast: AddToast; onQueued: () => void; api?: MissingTagsApi }) {
  const [n, setN] = useState<number | null>(null);
  const [fill, setFill] = useState<PbFillRun | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useRef(onQueued);
  reload.current = onQueued;
  const count = useCallback(() => api.count().then(setN).catch(e => logSwallowed('count missing tags', e)), [api]);
  const status = useCallback(() => api.status().then(f => { setFill(f); return f; }).catch(e => { logSwallowed('tags_fill_status', e); return null; }), [api]);
  useEffect(() => { void count(); void status(); }, [count, status]);
  const running = !!fill && !fill.finished_at;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      void status().then(f => { if (f?.finished_at) { void count(); reload.current(); } });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [running, status, count]);

  const shown = !!fill && fill.total > 0 && (running || Date.now() - Date.parse(fill.finished_at as string) < SHOW_DONE_MS);
  if (!n && !shown) return null;
  const go = async () => {
    setBusy(true);
    try {
      const q = await api.queue();
      addToast(q ? `AI is choosing tags for ${q.toLocaleString('en-IN')} product${q === 1 ? '' : 's'} — they move to Ready as it goes` : 'They are already waiting for the AI', 'success');
      await Promise.all([count(), status()]); // the batch shows at once, and this count drops to the ones not in it
      reload.current();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <PbTile variant={n ? 'review' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      {shown && <FillProgress fill={fill as PbFillRun} />}
      {!!n && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Dot color={PB.review} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal', flex: '1 1 220px' }}
            label={<span><span style={pbNum}>{n.toLocaleString('en-IN')}</span> {n === 1 ? 'product waits' : 'products wait'} for a required tag{running ? ' (not in the batch above)' : ''}</span>} />
          <PbButton icon="sparkles" style={{ whiteSpace: 'normal', padding: '8px 16px' }} onClick={() => void go()} busy={busy} busyLabel="Queuing…">
            Let AI decide for {n.toLocaleString('en-IN')} {n === 1 ? 'product' : 'products'}
          </PbButton>
        </div>
      )}
    </PbTile>
  );
}
