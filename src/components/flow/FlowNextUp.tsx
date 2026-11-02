// "Next up" beside the Flow list: for every cutting master and tailor named on
// a cutting / stitching step of a planning or running pipeline — what they
// are on now and what comes next (by due date, then pipeline age). Job
// workers get the same view from job-work steps.
import { T, S } from '../../lib/theme';
import { KINDS, fmtDay, qtyText } from './flowModel';
import type { PipelineRow } from './flowData';
import type { FlowKind, FlowStep } from '../../types/flow';

type Item = FlowStep & { pipe: PipelineRow };
const GROUPS: { kind: FlowKind; title: string }[] = [
  { kind: 'cutting', title: 'Cutting' }, { kind: 'stitching', title: 'Tailors' }, { kind: 'jobwork', title: 'Job workers' },
];

function queues(pipes: PipelineRow[], kind: FlowKind) {
  const open = pipes.filter(p => p.status === 'planning' || p.status === 'running');
  const items: Item[] = open.flatMap(p => p.flow_steps.filter(s => s.kind === kind && s.assignee && s.status !== 'done').map(s => ({ ...s, pipe: p })));
  const by = new Map<string, Item[]>();
  for (const it of items) by.set(it.assignee!, [...(by.get(it.assignee!) || []), it]);
  const order = (a: Item, b: Item) => (a.due_date || a.pipe.due_date || '9999').localeCompare(b.due_date || b.pipe.due_date || '9999') || a.pipe.flow_number - b.pipe.flow_number;
  return [...by.entries()].map(([name, list]) => {
    const now = list.filter(i => i.status === 'active' || i.status === 'blocked').sort(order);
    const next = list.filter(i => i.status === 'planned').sort(order);
    return { name, now, next };
  }).sort((a, b) => b.now.length + b.next.length - (a.now.length + a.next.length));
}

const line = (i: Item) => `F-${i.pipe.flow_number} · ${i.pipe.sku || i.pipe.title}${qtyText(i) ? ` · ${qtyText(i)}` : ''}${i.due_date ? ` · ${fmtDay(i.due_date)}` : ''}`;

export default function FlowNextUp({ pipes }: { pipes: PipelineRow[] }) {
  const groups = GROUPS.map(g => ({ ...g, people: queues(pipes, g.kind) })).filter(g => g.people.length);
  return (
    <aside aria-label="Next up" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...S.fLabel, marginBottom: 0, fontSize: 10, letterSpacing: '0.1em', padding: '0 2px' }}>Next up · who picks what</span>
      {groups.length === 0 && <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>Put a name on the cutting, stitching and job-work steps and each person's queue shows here.</div>}
      {groups.map(g => (
        <div key={g.kind} style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 11, fontWeight: 600, color: KINDS[g.kind].color }}>{g.title}</div>
          {g.people.map(p => (
            <div key={p.name} style={{ padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</span>
                <span style={{ fontSize: 10, color: T.tx3 }}>{p.now.length + p.next.length} batch{p.now.length + p.next.length === 1 ? '' : 'es'}</span>
              </span>
              <span style={{ fontSize: 11, color: T.tx2 }}><span style={{ color: T.tx3 }}>Now </span>{p.now.length ? p.now.map(line).join(' | ') : 'free'}</span>
              <span style={{ fontSize: 11, color: T.tx2 }}><span style={{ color: T.tx3 }}>Next </span>{p.next[0] ? line(p.next[0]) : 'nothing given yet'}{p.next.length > 1 ? ` (+${p.next.length - 1} more)` : ''}</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
