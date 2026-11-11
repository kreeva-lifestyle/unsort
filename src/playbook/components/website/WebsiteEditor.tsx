// One website's settings, in six sections. Name, publishing, routing default,
// pricing, tags and content are a draft saved together by "Save changes" (only
// the changed keys are sent). The store domain + credentials, the Active switch
// and routing rules save on their own (separate writes with their own buttons).
// The draft is reported up to Websites so the device Back button keeps it.
// Layout (V2): desktop = hero + section side list (3) beside the section (9);
// phone = hero + section rows, each section full screen with its own back.
import { useEffect, useState } from 'react';
import { useBackClose } from '../../../hooks/useBackClose';
import { friendlyError } from '../../../lib/friendlyError';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import PbConfirm from '../ui/PbConfirm';
import type { AddToast } from '../PbToasts';
import type { PbWebsite } from '../../types';
import type { VendorLite } from '../../data/products';
import { updateWebsite, type WebsitePatch } from '../../data/websites';
import { useIsPhone } from '../../hooks/useIsPhone';
import { Dot } from '../product/status';
import { PbPageHeader, PbTag, focusPageTitle } from '../ui';
import { connection } from './WebsiteCard';
import ConnectionSection, { credsTyped, newCreds, type Creds } from './ConnectionSection';
import PublishingSection from './PublishingSection';
import RoutingSection from './RoutingSection';
import PricingSection from './PricingSection';
import TagsSection from './TagsSection';
import ContentSection from './ContentSection';
import EditorHero from './shell/EditorHero';
import SaveBar from './shell/SaveBar';
import { SectionRows, SectionSideList } from './shell/SectionNav';
import { SECTIONS, sectionMeta, type SectionId } from './shell/sections';

export type Draft = Pick<PbWebsite, 'name' | 'publish_mode' | 'routing_default' | 'track_inventory' | 'pricing' | 'tag_rules' | 'content'>;
export type SetDraft = (p: Partial<Draft>) => void;

const pick = (s: PbWebsite): Draft => ({
  name: s.name, publish_mode: s.publish_mode, routing_default: s.routing_default,
  track_inventory: s.track_inventory, pricing: s.pricing, tag_rules: s.tag_rules, content: s.content,
});
// jsonb comes back with its keys re-ordered, so compare with sorted keys.
const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

type Tab = SectionId;

export default function WebsiteEditor({ site, initialDraft, onDraft, onClose, onSaved, addToast, vendors, categories }: {
  site: PbWebsite; initialDraft?: Draft; onDraft: (id: string, d: Draft | null) => void;
  onClose: () => void; onSaved: (w: PbWebsite) => void; addToast: AddToast; vendors: VendorLite[]; categories: string[];
}) {
  const [draft, setDraftState] = useState<Draft>(() => initialDraft ?? pick(site));
  // Typed domain / credentials live here, not in the Connection section, which unmounts when another section opens.
  const [creds, setCredsState] = useState<Creds>(() => newCreds(site));
  const setCreds = (p: Partial<Creds>) => setCredsState(c => ({ ...c, ...p }));
  const [tab, setTab] = useState<Tab>('connection');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { ask, modalProps } = useConfirm();
  const setDraft: SetDraft = p => setDraftState(d => ({ ...d, ...p }));
  const dirty = stable(draft) !== stable(pick(site));
  const c = connection(site);
  const phone = useIsPhone();
  // Phone: which section is open full screen (device Back returns to the overview).
  const [phoneOpen, setPhoneOpen] = useState(false);
  useBackClose(phone && phoneOpen, () => setPhoneOpen(false));
  useEffect(() => { onDraft(site.id, dirty ? draft : null); }, [site.id, draft, dirty, onDraft]);

  const showSection = (id: Tab) => {
    setTab(id);
    if (phone) { setPhoneOpen(true); document.querySelector('.pb-scroll')?.scrollTo({ top: 0 }); }
  };
  // Opening the editor (or a phone section) moves focus to its title, not <body>.
  useEffect(() => { focusPageTitle(); }, [phoneOpen]);

  const close = async () => {
    if ((dirty || credsTyped(creds, site)) && !(await ask({ title: 'Discard unsaved changes?', message: 'Your edits to this website have not been saved.', confirmLabel: 'Discard', danger: true }))) return;
    onDraft(site.id, null); onClose();
  };

  const save = async () => {
    const name = draft.name.trim().replace(/\s+/g, ' ');
    if (!name) { setErr('Give the website a name'); showSection('connection'); return; }
    if (draft.content.title_template.trim() === '') { setErr('The title pattern cannot be empty — use {ai_title} to let the AI write it.'); showSection('content'); return; }
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

  const saved = pick(site);
  const edited = (id: Tab) => SECTIONS.find(s => s.id === id)!.keys.some(k => stable(draft[k]) !== stable(saved[k]));
  const discard = () => { setDraftState(pick(site)); setErr(''); };
  const sectionLabel = SECTIONS.find(s => s.id === tab)!.label;

  const body = (
    <>
      {tab === 'connection' && <ConnectionSection site={site} draft={draft} set={setDraft} creds={creds} setCreds={setCreds} onSaved={onSaved} addToast={addToast} />}
      {tab === 'publishing' && <PublishingSection draft={draft} set={setDraft} />}
      {tab === 'routing' && <RoutingSection siteId={site.id} draft={draft} set={setDraft} addToast={addToast} vendors={vendors} categories={categories} />}
      {tab === 'pricing' && <PricingSection draft={draft} set={setDraft} />}
      {tab === 'tags' && <TagsSection draft={draft} set={setDraft} />}
      {tab === 'content' && <ContentSection draft={draft} set={setDraft} />}
    </>
  );
  const bar = (dirty || err) && <SaveBar dirty={dirty} err={err} saving={saving} onDiscard={discard} onSave={() => void save()} />;
  const hero = <EditorHero site={site} connLabel={c.label} onConnection={() => showSection('connection')} />;

  // Phone: overview (hero + one row per section) or one section full screen.
  if (phone) return (
    <div>
      {phoneOpen ? (
        <>
          <PbPageHeader back={{ label: site.name, onBack: () => setPhoneOpen(false) }} title={sectionLabel} sub={site.name} phoneSub phoneAction={null} />
          {body}
        </>
      ) : (
        <>
          <PbPageHeader back={{ label: 'Websites', onBack: () => void close() }} title={site.name} phoneAction={null} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {hero}
            <SectionRows onPick={showSection} edited={edited} meta={id => sectionMeta(id, draft, c.label)} />
          </div>
        </>
      )}
      {bar}
      <PbConfirm {...modalProps} />
    </div>
  );

  // Desktop: side column 3 (hero + section list, sticky under the top bar) + section body 9.
  return (
    <div>
      <PbPageHeader back={{ label: 'Websites', onBack: () => void close() }} title={site.name}
        sub={<span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          <Dot color={c.color} label={c.label} />
          <PbTag>{site.active ? 'On' : 'Off · nothing is sent'}</PbTag>
        </span>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 3fr) minmax(0, 9fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 'var(--pb-sticky-top)', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {hero}
          <SectionSideList current={tab} onPick={showSection} edited={edited} />
        </div>
        <div style={{ minWidth: 0 }}>
          {body}
          {bar}
        </div>
      </div>
      <PbConfirm {...modalProps} />
    </div>
  );
}
