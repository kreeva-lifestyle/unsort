// "Let AI decide" progress on the Tags page (owner, 13 Nov 2026: "should get better clarity — do not know whether its
// completed or how much is completed, or when it will get completed. How many are remaining of the total"). Every
// request of the newest batch together (pb-products fillProgress.ts): done of total with a bar, how many are left, the
// minutes that leaves at the pace of the last 5 minutes, and — while nothing moves — why. Once nothing waits: done, how
// many got their tags, how many still need a person, and when it finished. role="status": read out as it changes.
import type { PbFillRun } from '../../tagTypes';
import { istTime } from '../../format';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import { Dot } from '../product/status';
import { plural } from './tagText';

const n = (x: number) => <span style={pbNum}>{x.toLocaleString('en-IN')}</span>;
const mins = (m: number) => (m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h ${m % 60} min`);

/** The line under the bar while it runs: what is left and when it ends, or why it waits. */
function pace(f: PbFillRun): string {
  const left = `${plural(f.waiting, 'product')} left`;
  if (f.blocked === 'paused') return `${left} · waiting: automation is paused (Settings → Automation)`;
  if (f.blocked === 'limit') return `${left} · waiting: today's AI limit is used up — it carries on after midnight, or raise the limit in Settings → Automation`;
  if (f.eta_min) return `${left} · ${mins(f.eta_min)} to go at ${f.per_min} a minute`;
  return f.done ? `${left} · waiting its turn: the automation reads and writes listings first` : `${left} · starts within a minute or two`;
}

export default function FillProgress({ fill }: { fill: PbFillRun }) {
  const running = !fill.finished_at;
  const pct = fill.total ? Math.min(100, Math.round((fill.done / fill.total) * 100)) : 100;
  const need = fill.left_empty;
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <Dot color={running ? PB.busy : need ? PB.review : PB.live} style={{ color: PB.tx, fontSize: 13, fontWeight: 600, whiteSpace: 'normal' }}
        label={running ? <>Filling tags · {n(fill.done)} of {n(fill.total)} done · <span style={pbNum}>{pct}%</span></>
          : <>Done · {n(fill.filled)} of {n(fill.total)} got their tags{need ? <> · {n(need)} need you</> : null}</>} />
      <span aria-hidden="true" style={{ height: 8, borderRadius: PB.r.skel, background: PB.skelBar, overflow: 'hidden', display: 'block' }}>
        <span className={running ? 'pb-pulse' : undefined} style={{ display: 'block', height: '100%', width: `${running ? Math.max(4, pct) : 100}%`, background: running ? PB.busy : need ? PB.review : PB.live }} />
      </span>
      <span style={{ ...pbMeta, color: running && fill.blocked ? PB.review : PB.tx2, overflowWrap: 'anywhere' }}>
        {running ? pace(fill) : `Finished at ${istTime(fill.finished_at as string)}.${need ? ` ${need === 1 ? 'The one' : `The ${need}`} the AI couldn't tell ${need === 1 ? 'waits' : 'wait'} in Products → Needs info.` : ''}`}
      </span>
      {running && (
        <span style={pbMeta}>
          Started at {istTime(fill.created_at)}{(fill.runs ?? 1) > 1 ? <> · {n(fill.runs ?? 1)} requests together</> : null}. It runs in the background with the rest of the automation — you can leave this page.
        </span>
      )}
    </div>
  );
}
