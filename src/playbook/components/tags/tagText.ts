// Words for the Tags screens: kind labels, source labels, why a tag was
// hidden, and the sentences the toasts repeat. Plain data (no React).
import { TAG_KINDS, TAG_SOURCE_LABEL, type PbHidden, type PbTagKind, type PbTagSource } from '../../tagTypes';

export const kindLabel = (k: PbTagKind) => TAG_KINDS.find(x => x.id === k)?.label ?? 'Other';
export const sourceLabel = (s: PbTagSource) => TAG_SOURCE_LABEL[s] ?? 'From a website';

/** "hidden: matches the pattern ^_" — one short reason a tag was dropped. */
export function hiddenWhy(h: PbHidden): string {
  switch (h.reason) {
    case 'empty': return 'nothing left after cleaning';
    case 'short': return 'too short';
    case 'pattern': return `matches the pattern ${h.pattern ?? ''}`.trim();
    case 'exact': return 'hidden by name in the rules';
    case 'code': return 'looks like a code';
    case 'duplicate': return 'already in the list';
    case 'cap': return 'over the limit per product';
  }
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** The toast after a bulk action. */
export function actDone(action: string, n: number, into?: string): string {
  const t = plural(n, 'tag');
  switch (action) {
    case 'keep': return `${t} kept`;
    case 'hide': return `${t} hidden — left out of every website, still on the products`;
    case 'unhide': return `${t} visible again`;
    case 'merge': return `${t} merged into ${into ?? 'one tag'} — products now carry that name`;
    case 'rename': return 'Tag renamed on every product';
    case 'kind': return `Kind set on ${t}`;
    default: return 'Done';
  }
}
