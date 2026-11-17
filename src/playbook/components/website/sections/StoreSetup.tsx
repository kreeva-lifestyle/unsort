// "Collections and product fields" (Connection section; owner, 2026-11-17: "make all collections as per categories
// in playbook" and "Product Specifications & Custom Attributes (Metafields) as per playbook"). One tap makes, on the
// website's Shopify store, a collection for each Playbook category (Shopify fills it from the product type) and a
// product field for each attribute on the Tags page, plus Set contents and Questions (pb-products storeSetup.ts).
// What the store already has is left alone and nothing is deleted, so it can be tapped again after a new category
// or attribute. The answer is listed item by item, status as a dot plus a word; a store-wide failure (credentials,
// a missing permission) is one red line.
import { useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import type { AddToast } from '../../PbToasts';
import type { PbWebsite } from '../../../types';
import { setupStore, type SetupItem, type SetupResult } from '../../../data/websites';
import { PB, pbErrorBox, pbMeta } from '../../../pbTheme';
import { Dot, NEUTRAL } from '../../product/status';
import { PbButton } from '../../ui';
import { Section } from '../ui';

const LOOK: Record<SetupItem['status'], { color: string; word: string }> = {
  made: { color: PB.live, word: 'Made' }, kept: { color: NEUTRAL, word: 'Already there' },
  clash: { color: PB.review, word: 'Needs you' }, failed: { color: PB.failed, word: 'Not made' },
};
const count = (list: SetupItem[], s: SetupItem['status']) => list.filter(x => x.status === s).length;

function Group({ title, items }: { title: string; items: SetupItem[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ ...pbMeta, fontWeight: 600, color: PB.tx }}>{title}</span>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(i => (
          <li key={i.name} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: PB.tx }}>
              <span style={{ overflowWrap: 'anywhere' }}>{i.name}</span>
              <Dot color={LOOK[i.status].color} label={LOOK[i.status].word} />
            </span>
            {i.note && <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{i.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StoreSetup({ site, addToast }: { site: PbWebsite; addToast: AddToast }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SetupResult | null>(null);
  const [err, setErr] = useState('');
  const connected = !!site.connected_at;
  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await setupStore(site.id);
      setRes(r);
      const all = [...r.fields, ...r.collections], made = count(all, 'made'), bad = count(all, 'clash') + count(all, 'failed');
      addToast(`${site.name}: ${made ? `${made} made` : 'nothing new to make'}${count(all, 'kept') ? ` · ${count(all, 'kept')} already there` : ''}${bad ? ` · ${bad} need${bad === 1 ? 's' : ''} you (see the list)` : ''}`, bad ? 'info' : 'success');
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Section title="Collections and product fields"
      hint="Makes on this Shopify store a collection for each Playbook category, filled by Shopify from the product type, and a product field for each attribute on the Tags page (Colour, Fabric, Work…) plus Set contents and Questions, which every product sent fills in. What the store already has is left as it is and nothing is deleted: tap again after adding a category or attribute.">
      <PbButton icon="refresh" className="pb-phone-full" onClick={() => void run()} busy={busy} busyLabel="Setting up…" disabled={!connected}
        title={connected ? undefined : 'Connect the store first'}>Set up on Shopify</PbButton>
      {!connected && <span style={{ ...pbMeta, marginTop: 8 }}>Connect the store first (Test connection above).</span>}
      {err && <div role="alert" style={{ ...pbErrorBox, marginTop: 12, overflowWrap: 'anywhere' }}>{err}</div>}
      {res && (
        <div role="status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16, marginTop: 16 }}>
          <Group title={`Product fields · ${count(res.fields, 'made')} made`} items={res.fields} />
          <Group title={`Collections · ${count(res.collections, 'made')} made`} items={res.collections} />
        </div>
      )}
    </Section>
  );
}
