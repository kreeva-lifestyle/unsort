// Pure: what a fresh read changed, for the product's activity row
// ('read' → details.changed). Each entry is [what it was, what it is now];
// '' = the AI no longer finds it. Only a field that had a value before is
// listed (a first fill is not a change), so an AI correction — a colour the
// photos overruled, a pattern that was only a sales line — can be seen
// afterwards and put back by hand. No I/O; tested in test/readChanges.test.mjs.
import { ATTRS } from './readerPrompt.ts';

const FIELDS = ['name', 'fabric', 'color', 'category', 'sku'] as const;
const txt = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

type Facts = { [K in typeof FIELDS[number]]?: string | null } & { attributes?: Record<string, string> | null };

/** `set` = what the read is about to save (reader.ts merge): only the fields in it can have changed. */
export function readChanges(p: Facts, set: Record<string, unknown>): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const f of FIELDS) {
    const was = txt(p[f]);
    if (f in set && was && was !== txt(set[f])) out[f] = [was, txt(set[f])];
  }
  const now = set.attributes as Record<string, string> | undefined;
  if (now) for (const k of ATTRS) {
    const was = txt(p.attributes?.[k]);
    if (was && was !== txt(now[k])) out[k] = [was, txt(now[k])];
  }
  return out;
}
