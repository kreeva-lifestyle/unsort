// Publishing: how a finished listing reaches the store, and stock tracking.
// Layout: (Publishing mode 12) / (Track stock 12) — the mode picker needs the
// width for its three hints; phone stacks.
import PbSwitch from '../ui/PbSwitch';
import { PB } from '../../pbTheme';
import { PbTag } from '../ui';
import { Section, Seg } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

const MODES = [
  { id: 'live' as const, label: 'Live', hint: 'Published and visible on the store right away' },
  { id: 'draft' as const, label: 'Draft', hint: 'Sent to Shopify as a draft — you make it visible there' },
  { id: 'review' as const, label: 'Review first', hint: 'Waits in Products until someone taps Approve' },
];

export default function PublishingSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  const on = draft.track_inventory;
  return (
    <>
      <Section title="Publishing mode" hint="What happens after the AI has written a listing for this store.">
        <Seg label="Publishing mode" value={draft.publish_mode} onChange={v => set({ publish_mode: v })} options={MODES} />
      </Section>
      <Section title="Track stock" hint="On: Shopify counts stock and stops selling at 0 — new products start at 0, so set the quantities in Shopify (the app needs write_inventory). Off: always available to order."
        right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <PbTag>{on ? 'On' : 'Off'}</PbTag>
          <PbSwitch on={on} onToggle={() => set({ track_inventory: !on })} label="Track stock in Shopify" />
        </span>}>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: on ? PB.tx : PB.tx2 }}>
          {on ? 'Stock is tracked — new products cannot be bought until you set their quantities in Shopify.' : 'Not tracked — products stay orderable (made to order).'}
        </div>
      </Section>
    </>
  );
}
