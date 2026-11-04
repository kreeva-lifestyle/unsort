// Publishing: how a finished listing reaches the store, and stock tracking.
import { T } from '../../../lib/theme';
import Toggle from '../../../components/ui/Toggle';
import { Section, Seg } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

const MODES = [
  { id: 'live' as const, label: 'Live', hint: 'Published and visible on the store right away' },
  { id: 'draft' as const, label: 'Draft', hint: 'Sent to Shopify as a draft — you make it visible there' },
  { id: 'review' as const, label: 'Review first', hint: 'Waits in Products until someone taps Approve' },
];

export default function PublishingSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  return (
    <>
      <Section title="Publishing mode" hint="What happens after the AI has written a listing for this store.">
        <Seg label="Publishing mode" value={draft.publish_mode} onChange={v => set({ publish_mode: v })} options={MODES} />
      </Section>
      <Section title="Track stock" hint="On: Shopify counts stock and stops selling at 0 (the app needs write_inventory). Off: always available to order."
        right={<Toggle on={draft.track_inventory} onToggle={() => set({ track_inventory: !draft.track_inventory })} label="Track stock in Shopify" />}>
        <div style={{ fontSize: 12, color: draft.track_inventory ? T.tx2 : T.tx3 }}>
          {draft.track_inventory ? 'Stock is tracked — set quantities in Shopify after publishing.' : 'Not tracked — products stay orderable (made to order).'}
        </div>
      </Section>
    </>
  );
}
