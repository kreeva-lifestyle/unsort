// Live "~N min left" note for a run / auto-batch queue. The AI writing time
// per chunk is the clock here, so the estimate is a rolling SKU rate over the
// last few chunk completions — the first (cache-warming) chunk is slower and
// would poison a naive start-to-now average. Under auto-batch the count spans
// the WHOLE queue (finished batches + this one), so the readout answers "when
// is the whole file done", not "when is this batch done".
import { useRef } from 'react';
import { T } from '../../lib/theme';
import { RUN_CAP } from './useGenerateRun';

export default function RunEta({ done, total, batch }: {
  done: number; total: number;
  // skusTotal is the queue's SNAPSHOT of the list it runs — never the live
  // textarea count, which stays editable mid-run and would corrupt the ETA.
  batch: { current: number; skusTotal: number } | null;
}) {
  const doneAll = batch ? (batch.current - 1) * RUN_CAP + done : done;
  const totalAll = batch ? Math.max(batch.skusTotal, doneAll) : total;
  const samples = useRef<{ t: number; n: number }[]>([]);
  // A fresh run/queue starts the sampling over (progress counts backwards).
  if (samples.current.length && doneAll < samples.current[samples.current.length - 1].n) samples.current = [];
  const s = samples.current;
  // Guarded push: only on real progress, so StrictMode re-renders are inert.
  if (!s.length || doneAll > s[s.length - 1].n) {
    s.push({ t: Date.now(), n: doneAll });
    if (s.length > 12) s.shift();
  }
  let eta = 'estimating time left…';
  if (s.length >= 2) {
    const rate = (s[s.length - 1].n - s[0].n) / (s[s.length - 1].t - s[0].t); // SKUs per ms
    const rem = totalAll - doneAll;
    if (rem <= 0) eta = 'finishing up…';
    else if (rate > 0) {
      const min = Math.ceil(rem / rate / 60_000);
      eta = min <= 1 ? 'about a minute left' : min < 60 ? `~${min} min left` : `~${Math.floor(min / 60)}h ${min % 60}m left`;
    }
  }
  return (
    <span style={{ fontSize: 11, color: T.tx3 }}>
      Fetching data, photos and writing listings — <b style={{ color: T.tx2, fontWeight: 600 }}>{eta}</b> · stay on this screen…
    </span>
  );
}
