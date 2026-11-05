// One website's settings, in six sections. Name, publishing, routing default,
// pricing, tags and content are a draft saved together by "Save changes" (only
// the changed keys are sent). The store domain + credentials, the Active switch
// and routing rules save on their own (separate writes with their own buttons).
// The draft is reported up to Websites so the device Back button keeps it.
import { useEffect, useState } from 'react';
import { T, S, alpha } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import ConfirmModal, { useConfirm } from '../../../components/ui/ConfirmModal';
import type { AddToast } from '../PbToasts';
import type { PbWebsite } from '../../types';
import type { VendorLite } from '../../data/products';
import { updateWebsite, type WebsitePatch } from '../../data/websites';
import { Dot } from '../product/status';
import { connection } from './WebsiteCard';
import ConnectionSection from './ConnectionSection';
import PublishingSection from './PublishingSection';
import RoutingSection from './RoutingSection';
import PricingSection from './PricingSection';
import TagsSection from './TagsSection';
import ContentSection from './ContentSection';

export type Draft = Pick<PbWebsite, 'name' | 'publish_mode' | 'routing_default' | 'track_inventory' | 'pricing' | 'tag_rules' | 'content'>;
export type SetDraft = (p: Partial<Draft>) => void;

const pick = (s: PbWebsite): Draft => ({
  name: s.name, publish_mode: s.publish_mode, routing_default: s.routing_default,
  track_inventory: s.track_inventory, pricing: s.pricing, tag_rules: s.tag_rules, content: s.content,
});
// jsonb comes back with its keys re-ordered, so compare with sorted keys.
const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

const TABS = [
  { id: 'connection', label: 'Connection' }, { id: 'publishing', label: 'Publishing' }, { id: 'routing', label: 'Routing rules' },
  { id: 'pricing', label: 'Pricing' }, { id: 'tags', label: 'Tags' }, { id: 'content', label: 'Content & AI' },
] as const;
type Tab = typeof TABS[number]['id'];

export default function WebsiteEditor({ site, initialDraft, onDraft, onClose, onSaved, addToast, vendors, categories }: {
  site: PbWebsite; initialDraft?: Draft; onDraft: (id: string, d: Draft | null) => void;
  onClose: () => void; onSaved: (w: PbWebsite) => void; addToast: AddToast; vendors: VendorLite[]; categories: string[];
}) {
  const [draft, setDraftState] = useState<Draft>(() => initialDraft ?? pick(site));
  const [tab, setTab] = useState<Tab>('connection');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { ask, modalProps } = useConfirm();
  const setDraft: SetDraft = p => setDraftState(d => ({ ...d, ...p }));
  const dirty = stable(draft) !== stable(pick(site));
  const c = connection(site);
  useEffect(() => { onDraft(site.id, dirty ? draft : null); }, [site.id, draft, dirty, onDraft]);

  const close = async () => {
    if (dirty && !(await ask({ title: 'Discard unsaved changes?', message: 'Your edits to this website have not been saved.', confirmLabel: 'Discard', danger: true }))) return;
    onDraft(site.id, null); onClose();
  };

  const save = async () => {
    const name = draft.name.trim().replace(/\s+/g, ' ');
    if (!name) { setErr('Give the website a name'); setTab('connection'); return; }
    if (draft.content.title_template.trim() === '') { setErr('The title pattern cannot be empty — use {ai_title} to let the AI write it.'); setTab('content'); return; }
    // Only the keys that really changed — so the activity log says what was edited.
    const next: Draft = { ...draft, name }, cur = pick(site);
    const patch = Object.fromEntries((Object.keys(next) as (keyof Draft)[])
      .filter(k => stable(next[k]) !== stable(cur[k])).map(k => [k, next[k]])) as WebsitePatch;
    if (!Object.keys(patch).length) { setDraftState(cur); setErr(''); return; }
    setSaving(true); setErr('');
    try {
      const w = await updateWebsite(site.id, patch);
      onSaved(w); setDraftState(pick(w));
      addToast('Website saved', 'success');
    } catch (e) {
      const m = friendlyError(e); setErr(m); addToast(m, 'error');
    } finally { setSaving(false); }
  };

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined}
      style={{
        flexShrink: 0, minHeight: 44, padding: '0 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans,
        fontSize: 13, fontWeight: tab === t ? 600 : 500, color: tab === t ? T.tx : T.tx3,
        borderBottom: `2px solid ${tab === t ? T.yl : 'transparent'}`,
      }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button type="button" onClick={() => void close()} aria-label="Back to websites" style={{ ...S.btnGhost, minHeight: 44, minWidth: 44 }}>&#8592;</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4 }}>
            <Dot color={c.color} label={c.label} />
            <Dot color={site.active ? T.gr : T.tx3} label={site.active ? 'On' : 'Off — nothing is sent'} />
          </div>
        </div>
      </div>
      <nav aria-label="Website sections" style={{ display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', borderBottom: `1px solid ${T.bd}`, marginBottom: 14 }}>
        {TABS.map(t => tabBtn(t.id, t.label))}
      </nav>

      {tab === 'connection' && <ConnectionSection site={site} draft={draft} set={setDraft} onSaved={onSaved} addToast={addToast} />}
      {tab === 'publishing' && <PublishingSection draft={draft} set={setDraft} />}
      {tab === 'routing' && <RoutingSection siteId={site.id} draft={draft} set={setDraft} addToast={addToast} vendors={vendors} categories={categories} />}
      {tab === 'pricing' && <PricingSection draft={draft} set={setDraft} />}
      {tab === 'tags' && <TagsSection draft={draft} set={setDraft} />}
      {tab === 'content' && <ContentSection draft={draft} set={setDraft} />}

      {(dirty || err) && (
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 5, marginTop: 6, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
          background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: T.rLg, boxShadow: `0 -8px 24px ${alpha(T.bg, 0.35)}`,
        }}>
          {err && <div style={{ ...S.errorBox, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: dirty ? T.yl : T.tx3, flex: 1, minWidth: 120 }}>{dirty ? 'Unsaved changes' : 'Nothing to save'}</span>
            <button type="button" onClick={() => { setDraftState(pick(site)); setErr(''); }} disabled={!dirty}
              style={{ ...S.btnGhost, minHeight: 44, opacity: dirty ? 1 : 0.4 }}>Discard</button>
            <button type="button" onClick={() => void save()} disabled={!dirty}
              style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving || !dirty ? 'none' : 'auto', opacity: saving || !dirty ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
