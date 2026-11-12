// Publishing: how a finished listing reaches the store, and stock tracking.
// Stock (owner, 2026-11-12): with Track stock off Playbook decides. Every size
// has Track quantity on in Shopify, and "Continue selling when out of stock" is
// ticked while the product is In stock and unticked when it is Out of stock
// (Sold out at 0). With Track stock on, Shopify's own numbers decide.
// Layout: (Publishing mode 12) / (Track stock 12) — the mode picker needs the
// width for its three hints; phone stacks.
import PbSwitch from '../ui/PbSwitch';
import { PB } from '../../pbTheme';
import { PbTag } from '../ui';
import { Section, Seg } from './ui';
import { Cell, SectionGrid } from './sections/SectionGrid';
import type { Draft, SetDraft } from './WebsiteEditor';

const MODES = [
  { id: 'live' as const, label: 'Live', hint: 'Published and visible on the store right away' },
  { id: 'draft' as const, label: 'Draft', hint: 'Sent to Shopify as a draft — you make it visible there' },
  { id: 'review' as const, label: 'Review first', hint: 'Waits in Products until someone taps Approve' },
];

export default function PublishingSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  const on = draft.track_inventory;
  return (
    <SectionGrid>
      <Cell><Section title="Publishing mode" hint="What happens after the AI has written a listing for this store.">
        <Seg label="Publishing mode" value={draft.publish_mode} onChange={v => set({ publish_mode: v })} options={MODES} />
      </Section></Cell>
      <Cell><Section title="Track stock" hint="Off: Playbook decides. In Shopify, “Continue selling when out of stock” is ticked while a product is In stock and unticked when it is Out of stock, so it shows as Sold out. No stock number is sent. On: Shopify counts stock and stops selling at 0 — new products start at 0, so set the quantities in Shopify."
        right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <PbTag>{on ? 'On' : 'Off'}</PbTag>
          <PbSwitch on={on} onToggle={() => set({ track_inventory: !on })} label="Track stock in Shopify" />
        </span>}>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: on ? PB.tx : PB.tx2 }}>
          {on ? 'Shopify counts the stock — new products cannot be bought until you set their quantities there, and Playbook’s Out of stock is not sent.' : 'Playbook decides — In stock keeps selling, Out of stock shows as Sold out.'}
        </div>
      </Section></Cell>
    </SectionGrid>
  );
}
