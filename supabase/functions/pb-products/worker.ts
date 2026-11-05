// The automation run ('work'): read → route → generate → publish, oldest
// first. Stops STARTING new items after ~100 s (every outside call also ends
// by ~140 s, under the edge runtime's wall clock; a publish starts only while
// 70 s are left, see PUBLISH_NEEDS_MS; a read only while READ_NEEDS_MS and a
// generation only while GEN_NEEDS_MS are left, so the AI call is never cut
// short by the run's own clock) and caps each step per call:
// at most 6 reads, 8 generations, 10 publishes. Each item records its own
// outcome (status, error, pb_activity) inside its step, so a failure here is
// only counted and logged, and the run moves on to the next item.
import { claimGenerate, genCandidates, generateOne } from './generate.ts';
import { plain } from './http.ts';
import { claimPublish, PUBLISH_NEEDS_MS, pubCandidates, publishOne } from './publish.ts';
import { claimRead, readCandidates, readOne } from './reader.ts';
import type { Budget } from './types.ts';

export interface WorkResult { read: number; routed: number; generated: number; published: number; failed: number }

const CAPS = { read: 6, generate: 8, publish: 10 };
/** Time an AI step needs left before it is claimed: photo checks + a slow answer (Opus / high effort). */
const READ_NEEDS_MS = 45_000;
const GEN_NEEDS_MS = 80_000;

export function newBudget(): Budget {
  const t0 = Date.now();
  return { soft: t0 + 100_000, hard: t0 + 140_000 };
}

export async function work(userId: string | null): Promise<WorkResult> {
  const budget = newBudget();
  const out: WorkResult = { read: 0, routed: 0, generated: 0, published: 0, failed: 0 };
  const inTime = () => Date.now() < budget.soft;
  const left = (need: number) => inTime() && budget.hard - Date.now() >= need;
  const failed = (step: string, id: string, e: unknown) => {
    out.failed++;
    console.error(`pb-products ${step} ${id}: ${plain(e)}`);
  };

  for (const c of await readCandidates(CAPS.read)) {
    if (!left(READ_NEEDS_MS)) break;
    const p = await claimRead(c.id, false);
    if (!p) continue; // another run took it
    try {
      const r = await readOne(p, { manual: false, userId, budget });
      out.read++; out.routed += r.routed;
      if (r.warning) console.error(`pb-products route ${c.id}: ${r.warning}`);
    } catch (e) { failed('read', c.id, e); }
  }

  for (const c of left(GEN_NEEDS_MS) ? await genCandidates(CAPS.generate) : []) {
    if (!left(GEN_NEEDS_MS)) break;
    const l = await claimGenerate(c.id, false);
    if (!l) continue;
    try { await generateOne(l, { manual: false, userId, budget }); out.generated++; } catch (e) { failed('generate', c.id, e); }
  }

  // A publish is started only with time to finish it (a slow productSet may take up to 90 s).
  const pubTime = () => left(PUBLISH_NEEDS_MS + 10_000);
  for (const c of pubTime() ? await pubCandidates(CAPS.publish) : []) {
    if (!pubTime()) break;
    const l = await claimPublish(c.id, false);
    if (!l) continue;
    try {
      const r = await publishOne(l, { manual: false, userId, budget });
      if (r.status === 'published') out.published++;
    } catch (e) { failed('publish', c.id, e); }
  }
  return out;
}
