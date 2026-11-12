// The seven editor sections: label, icon, the draft keys each one edits (so the
// nav can mark a section with unsaved edits; `part` narrows that to its own
// half when two sections share a key, as Store profile and Content & AI share
// `content`) and a one-line summary for the phone section rows. Pure data; the
// sections themselves render their tiles.
import type { PbWebsite } from '../../../types';
import { rupees } from '../../product/status';

type Draft = Pick<PbWebsite, 'name' | 'publish_mode' | 'routing_default' | 'track_inventory' | 'pricing' | 'tag_rules' | 'content'>;

export const MODE_LABEL: Record<PbWebsite['publish_mode'], string> = {
  live: 'Publishes live', draft: 'Sends as draft', review: 'Waits for review',
};

export const SECTIONS = [
  { id: 'connection', label: 'Connection', icon: 'link', keys: ['name'] },
  { id: 'publishing', label: 'Publishing', icon: 'arrowUpRight', keys: ['publish_mode', 'track_inventory'] },
  { id: 'routing', label: 'Routing rules', icon: 'flow', keys: ['routing_default'] },
  { id: 'pricing', label: 'Pricing', icon: 'receipt', keys: ['pricing'] },
  { id: 'tags', label: 'Tags', icon: 'tag', keys: ['tag_rules'] },
  { id: 'profile', label: 'Store profile', icon: 'globe', keys: ['content'], part: (d: Draft) => d.content.profile },
  { id: 'content', label: 'Content & AI', icon: 'sparkles', keys: ['content'], part: (d: Draft) => ({ ...d.content, profile: null }) },
] as const satisfies readonly { id: string; label: string; icon: string; keys: readonly (keyof Draft)[]; part?: (d: Draft) => unknown }[];

/** What a section edits, for the "Unsaved" mark: its own part of a shared key, else its keys. */
export const sectionPart = (id: SectionId, d: Draft): unknown => {
  const s = SECTIONS.find(x => x.id === id)!;
  return 'part' in s ? s.part(d) : s.keys.map(k => d[k]);
};

export type SectionId = typeof SECTIONS[number]['id'];

const clip = (t: string, n = 56) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One meta line per section for the phone rows (from the unsaved draft). */
export function sectionMeta(id: SectionId, d: Draft, connLabel: string): string {
  switch (id) {
    case 'connection': return connLabel;
    case 'publishing': return `${MODE_LABEL[d.publish_mode]} · ${d.track_inventory ? 'Tracks stock' : 'Stock not tracked'}`;
    case 'routing': return d.routing_default === 'all' ? 'No rule matches: list everything' : 'No rule matches: do not list it';
    case 'pricing': return `Cost + ${d.pricing.markup_pct}% + ${rupees(d.pricing.add_flat)}`;
    case 'tags': return `${plural(d.tag_rules.templates.length, 'template', 'templates')} · ${plural(d.tag_rules.static.length, 'fixed tag', 'fixed tags')}`;
    case 'profile': return [d.content.profile.brand_name.trim(), d.content.profile.market.trim(), clip(d.content.profile.angle.trim(), 40)].filter(Boolean).join(' · ') || 'Brand, audience, search phrase';
    case 'content': return [d.content.language, clip(d.content.brand_voice.trim())].filter(Boolean).join(' · ') || 'Voice, title, length';
  }
}
